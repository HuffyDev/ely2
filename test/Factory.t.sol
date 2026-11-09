// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {LaunchFactory} from "../contracts/LaunchFactory.sol";
import {LaunchFeeHook} from "../contracts/LaunchFeeHook.sol";
import {FixedToken} from "../contracts/FixedToken.sol";
import {FeeRules} from "../contracts/FeeRules.sol";

contract FactoryTest is Test {
    uint256 private constant SIGNER = 0xA77E57;

    function test_AtomicLaunchAndCreatorTrigger() public {
        string memory rpc = vm.envOr("HOOK_TEST_RPC", string(""));
        if (bytes(rpc).length != 0) {
            vm.createSelectFork(rpc, vm.envUint("HOOK_TEST_BLOCK"));
        }
        address creator = makeAddr("creator");
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
        LaunchFactory.Launch memory p = LaunchFactory.Launch(
            "Test", "TEST", bytes32(uint256(1)), 0, 100 ether, 0, 10 ether, rules
        );
        bytes32 tokenHash = keccak256(abi.encodePacked(type(FixedToken).creationCode, abi.encode(p.name, p.symbol, factory.SUPPLY())));
        address token = predict(address(factory), keccak256(abi.encode(creator, p.tokenSalt)), tokenHash);
        bytes32 hookHash = keccak256(abi.encodePacked(type(LaunchFeeHook).creationCode, abi.encode(manager, token, p.rules, creator, factory)));
        while (uint160(predict(address(factory), p.hookSalt, hookHash)) & 0x3fff != 0x2080) {
            p.hookSalt = bytes32(uint256(p.hookSalt) + 1);
        }
        uint256 expiry = block.timestamp + 300;
        bytes32 reportHash = keccak256("local execution fixture");
        bytes32 approval = factory.approvalHash(p, creator, 100 ether, reportHash, expiry);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", approval)));
        vm.deal(creator, 100 ether);
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.Unauthorized.selector);
        factory.launch{value: 99 ether}(p, reportHash, expiry, v, r, s);

        vm.prank(creator);
        uint256 gasBefore = gasleft();
        (address deployed, address hook) = factory.launch{value: 100 ether}(p, reportHash, expiry, v, r, s);
        emit log_named_uint("fixture launch execution gas", gasBefore - gasleft());
        emit log_named_uint("fixture native seed in wei", address(manager).balance - balanceBefore);
        assertEq(deployed, token);
        assertEq(FixedToken(token).balanceOf(creator), 10 ether);
        assertEq(FixedToken(token).totalSupply(), factory.SUPPLY());
        roundTrip(factory, token, makeAddr("pre-trigger holder"), 1e9);
        assertEq(LaunchFeeHook(hook).elevatedUntil(), 0);
        vm.startPrank(creator);
        FixedToken(token).approve(address(factory), 1 ether);
        factory.swap(token, false, 1 ether, 1, expiry);
        vm.stopPrank();
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
