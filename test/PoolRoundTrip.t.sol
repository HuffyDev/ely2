// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {LaunchFeeHook} from "../contracts/LaunchFeeHook.sol";
import {FeeRules} from "../contracts/FeeRules.sol";

contract PoolRoundTripTest is Test {
    receive() external payable {}

    function test_RoundTrips() public {
        PoolManager manager = new PoolManager(address(this));
        PoolSwapTest router = new PoolSwapTest(manager);
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        MockERC20 token = new MockERC20("Test Coin", "TEST", 18);
        FeeRules.Spec memory spec = FeeRules.Spec(30, 500, 500, 500, 600, 0, 0);
        bytes32 hash = keccak256(abi.encodePacked(type(LaunchFeeHook).creationCode, abi.encode(manager, token, spec, address(this), address(router))));
        bytes32 salt;
        while (uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))) & 0x3fff != 0x2080) {
            salt = bytes32(uint256(salt) + 1);
        }
        LaunchFeeHook hook = new LaunchFeeHook{salt: salt}(manager, address(token), spec, address(this), address(router));
        PoolKey memory key = PoolKey(Currency.wrap(address(0)), Currency.wrap(address(token)), 0x800000, 60, IHooks(address(hook)));
        manager.initialize(key, 1 << 96);
        token.mint(address(this), 1000 ether);
        token.approve(address(lp), type(uint256).max);
        vm.deal(address(this), 1000 ether);
        lp.modifyLiquidity{value: 1000 ether}(key, ModifyLiquidityParams(-1200, 1200, 1000 ether, 0), "");
        uint256[3] memory elapsed = [uint256(0), 599, 600];
        uint256[4] memory sizes = [uint256(1e9), 1e12, 0.1 ether, 1 ether];
        for (uint256 i; i < elapsed.length; ++i) {
            vm.warp(hook.startsAt() + elapsed[i]);
            for (uint256 j; j < sizes.length; ++j) {
                address holder = j == 3 ? address(this) : address(uint160(0x100 + j));
                roundTrip(router, token, key, holder, sizes[j]);
            }
        }
    }

    function roundTrip(PoolSwapTest router, MockERC20 token, PoolKey memory key, address holder, uint256 amount) private {
        vm.deal(holder, amount);
        uint256 beforeBuy = token.balanceOf(holder);
        vm.startPrank(holder);
        PoolSwapTest.TestSettings memory settings = PoolSwapTest.TestSettings(false, false);
        router.swap{value: amount}(key, SwapParams(true, -int256(amount), TickMath.MIN_SQRT_PRICE + 1), settings, "");
        uint256 bought = token.balanceOf(holder) - beforeBuy;
        assertGt(bought, 0);
        token.approve(address(router), bought);
        uint256 beforeSell = holder.balance;
        router.swap(key, SwapParams(false, -int256(bought), TickMath.MAX_SQRT_PRICE - 1), settings, "");
        assertEq(token.balanceOf(holder), beforeBuy);
        assertGt(holder.balance, beforeSell);
        vm.stopPrank();
    }
}
