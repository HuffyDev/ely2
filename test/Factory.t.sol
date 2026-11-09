// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {LaunchFactory} from "../contracts/LaunchFactory.sol";
import {LaunchFeeHook} from "../contracts/LaunchFeeHook.sol";
import {FixedToken} from "../contracts/FixedToken.sol";
import {FeeRules} from "../contracts/FeeRules.sol";

contract FactoryTest is Test {
    receive() external payable {}

    uint256 private constant SIGNER = 0xA77E57;

    function test_AtomicLaunchAndCreatorTrigger() public {
        string memory rpc = vm.envOr("HOOK_TEST_RPC", string(""));
        if (bytes(rpc).length != 0) {
            vm.createSelectFork(rpc, vm.envUint("HOOK_TEST_BLOCK"));
        }
        address creator = vm.envOr("SIM_CREATOR", makeAddr("creator"));
        address forkManager = vm.envOr("HOOK_FORK_MANAGER", address(0));
        IPoolManager manager = forkManager == address(0) ? IPoolManager(address(new PoolManager(address(this)))) : IPoolManager(forkManager);
        uint256 balanceBefore = address(manager).balance;
        FeeRules.Spec memory rules = FeeRules.Spec(
            uint16(vm.envOr("SIM_BUY", uint256(30))), uint16(vm.envOr("SIM_SELL", uint256(30))),
            uint16(vm.envOr("SIM_OPEN_BUY", uint256(0))), uint16(vm.envOr("SIM_OPEN_SELL", uint256(0))),
            uint32(vm.envOr("SIM_WINDOW", uint256(0))), uint16(vm.envOr("SIM_TRIGGER_FEE", uint256(500))),
            uint32(vm.envOr("SIM_TRIGGER_WINDOW", uint256(1800)))
        );
        LaunchFactory factory = new LaunchFactory(manager, vm.addr(SIGNER));
        uint256 funding = vm.envOr("SIM_FUNDING", uint256(100 ether));
        LaunchFactory.Launch memory p = LaunchFactory.Launch(
            vm.envOr("SIM_NAME", string("Test")), vm.envOr("SIM_SYMBOL", string("TEST")),
            vm.envOr("SIM_SALT", bytes32(uint256(1))), 0,
            uint128(vm.envOr("SIM_LIQUIDITY", uint256(100 ether))),
            int24(vm.envOr("SIM_TICK", int256(0))), vm.envOr("SIM_ALLOCATION", uint256(10 ether)), rules
        );
        bytes32 tokenHash = keccak256(abi.encodePacked(type(FixedToken).creationCode, abi.encode(p.name, p.symbol, factory.SUPPLY(), creator)));
        address token = predict(address(factory), keccak256(abi.encode(creator, p.tokenSalt)), tokenHash);
        bytes32 hookHash = keccak256(abi.encodePacked(type(LaunchFeeHook).creationCode, abi.encode(manager, token, p.rules, creator, factory)));
        while (uint160(predict(address(factory), p.hookSalt, hookHash)) & 0x3fff != 0x2080) {
            p.hookSalt = bytes32(uint256(p.hookSalt) + 1);
        }
        uint256 expiry = block.timestamp + 300;
        bytes32 reportHash = keccak256("local execution fixture");
        bytes32 approval = factory.approvalHash(p, creator, funding, reportHash, expiry);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", approval)));
        vm.deal(creator, funding + 1);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.Unauthorized.selector);
        factory.launch{value: funding + 1}(p, reportHash, expiry, v, r, s);

        vm.prank(creator);
        uint256 gasBefore = gasleft();
        (address deployed, address hook) = factory.launch{value: funding}(p, reportHash, expiry, v, r, s);
        emit log_named_uint("fixture launch execution gas", gasBefore - gasleft());
        emit log_named_uint("fixture native seed in wei", address(manager).balance - balanceBefore);
        emit log_named_bytes32("fixture hook salt", p.hookSalt);
        emit log_named_uint("simulation chain id", block.chainid);
        emit log_named_address("simulation factory", address(factory));
        emit log_named_address("simulation manager", address(manager));
        emit log_named_address("simulation token", deployed);
        emit log_named_address("simulation hook", hook);
        emit log_named_bytes32("simulation factory code hash", address(factory).codehash);
        emit log_named_bytes32("simulation manager code hash", address(manager).codehash);
        assertEq(deployed, token);
        assertEq(FixedToken(token).balanceOf(creator), p.creatorAllocation);
        assertEq(FixedToken(token).lastCreatorTransfer(), 0);
        vm.deal(creator, funding);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.InvalidLaunch.selector);
        factory.launch{value: funding}(p, reportHash, expiry, v, r, s);
        assertEq(FixedToken(token).totalSupply(), factory.SUPPLY());
        roundTrip(factory, token, makeAddr("pre-trigger holder"), 1e9);
        assertEq(LaunchFeeHook(hook).elevatedUntil(), 0);
        vm.deal(creator, 0.001 ether);
        vm.startPrank(creator);
        uint128 creatorSell = uint128(factory.swap{value: 0.001 ether}(token, true, 0.001 ether, 1, expiry));
        FixedToken(token).approve(address(factory), creatorSell);
        factory.swap(token, false, creatorSell, 1, expiry);
        vm.stopPrank();
        assertEq(FixedToken(token).lastCreatorTransfer(), block.timestamp);
        assertEq(LaunchFeeHook(hook).elevatedUntil(), rules.triggerSeconds == 0 ? 0 : block.timestamp + rules.triggerSeconds);
        uint256 start = block.timestamp;
        uint256[5] memory times = [uint256(0), rules.windowSeconds > 0 ? uint256(rules.windowSeconds) - 1 : 0, rules.windowSeconds, rules.triggerSeconds > 0 ? uint256(rules.triggerSeconds) - 1 : 0, rules.triggerSeconds];
        for (uint256 i = 1; i < times.length; ++i) {
            uint256 value = times[i];
            uint256 j = i;
            while (j > 0 && times[j - 1] > value) {
                times[j] = times[j - 1];
                --j;
            }
            times[j] = value;
        }
        for (uint256 phase; phase < times.length; ++phase) {
            if (phase != 0 && times[phase] == times[phase - 1]) continue;
            vm.warp(start + times[phase]);
            roundTrip(factory, token, makeAddr("small holder"), 1e9);
            roundTrip(factory, token, makeAddr("normal holder"), 0.1 ether);
            roundTrip(factory, token, makeAddr("large holder"), 2 ether);
        }
        if (!vm.envOr("SIM_DRAFT", false)) exerciseOtherPaths(factory, manager, FixedToken(token), LaunchFeeHook(hook), creator);
    }

    function exerciseOtherPaths(LaunchFactory factory, IPoolManager manager, FixedToken coin, LaunchFeeHook hook, address creator)
        private
    {
        PoolSwapTest other = new PoolSwapTest(manager);
        PoolKey memory key = PoolKey(Currency.wrap(address(0)), Currency.wrap(address(coin)), 0x800000, 60, IHooks(address(hook)));
        vm.warp(block.timestamp + 1);
        sellThrough(other, key, coin, creator, 0.01 ether);
        assertEq(coin.lastCreatorTransfer(), block.timestamp);

        PoolKey memory otherPool = PoolKey(key.currency0, key.currency1, 3000, 60, IHooks(address(0)));
        manager.initialize(otherPool, 1 << 96);
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        vm.deal(address(this), 4 ether);
        factory.swap{value: 2 ether}(address(coin), true, 2 ether, 1, block.timestamp);
        coin.approve(address(lp), 1 ether);
        lp.modifyLiquidity{value: 1 ether}(otherPool, ModifyLiquidityParams(-1200, 1200, 10 ether, 0), "");
        vm.warp(block.timestamp + 1);
        sellThrough(other, otherPool, coin, creator, 0.01 ether);
        assertEq(coin.lastCreatorTransfer(), block.timestamp);

        address intermediary = makeAddr("intermediary");
        vm.warp(block.timestamp + 1);
        vm.prank(creator);
        coin.transfer(intermediary, 0.01 ether);
        uint256 transferredAt = block.timestamp;
        assertEq(coin.lastCreatorTransfer(), transferredAt);
        vm.warp(block.timestamp + 1);
        sellThrough(other, key, coin, intermediary, 0.01 ether);
        assertEq(coin.lastCreatorTransfer(), transferredAt);

        vm.prank(intermediary);
        coin.transferFrom(creator, intermediary, 0);
        vm.prank(creator);
        coin.transfer(creator, 1);
        assertEq(coin.lastCreatorTransfer(), transferredAt);
    }

    function sellThrough(PoolSwapTest other, PoolKey memory key, FixedToken coin, address wallet, uint128 amount)
        private
    {
        uint256 before = wallet.balance;
        vm.startPrank(wallet);
        coin.approve(address(other), amount);
        other.swap(key, SwapParams(false, -int256(uint256(amount)), TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false), "");
        vm.stopPrank();
        assertGt(wallet.balance, before);
    }

    function roundTrip(LaunchFactory factory, address token, address holder, uint128 input) private {
        vm.deal(holder, input);
        vm.startPrank(holder);
        uint128 amount = uint128(factory.swap{value: input}(token, true, input, 1, block.timestamp));
        FixedToken(token).approve(address(factory), amount);
        uint256 received = factory.swap(token, false, amount, 1, block.timestamp);
        assertGt(received, 0);
        assertEq(FixedToken(token).balanceOf(holder), 0);
        vm.stopPrank();
        emit log_named_uint("holder sell output in wei", received);
    }

    function predict(address factory, bytes32 salt, bytes32 hash) private pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), factory, salt, hash)))));
    }
}
