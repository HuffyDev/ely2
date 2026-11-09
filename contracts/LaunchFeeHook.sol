// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {FixedToken} from "./FixedToken.sol";
import {FeeRules} from "./FeeRules.sol";

contract LaunchFeeHook {
    IPoolManager public immutable manager;
    address public immutable token;
    uint256 public immutable startsAt;
    uint16 public immutable buyBps;
    uint16 public immutable sellBps;
    uint16 public immutable openingBuyBps;
    uint16 public immutable openingSellBps;
    uint32 public immutable windowSeconds;

    address public immutable creator;
    address public immutable router;
    uint16 public immutable triggerSellBps;
    uint32 public immutable triggerSeconds;


    error InvalidPool();

    constructor(IPoolManager manager_, address token_, FeeRules.Spec memory spec, address creator_, address router_) {
        FeeRules.validate(spec);
        if (token_ == address(0) || address(manager_).code.length == 0 ||
            uint160(address(this)) & Hooks.ALL_HOOK_MASK != (Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_INITIALIZE_FLAG)) revert InvalidPool();
        manager = manager_;
        creator = creator_;
        router = router_;
        triggerSellBps = spec.triggerSellBps;
        triggerSeconds = spec.triggerSeconds;
        token = token_;
        startsAt = block.timestamp;
        buyBps = spec.buyBps;
        sellBps = spec.sellBps;
        openingBuyBps = spec.openingBuyBps;
        openingSellBps = spec.openingSellBps;
        windowSeconds = spec.windowSeconds;
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external view returns (bytes4) {
        if (msg.sender != address(manager) || (sender != router && sender != creator)) revert InvalidPool();
        validatePool(key);
        return IHooks.beforeInitialize.selector;
    }

    function elevatedUntil() public view returns (uint256) {
        if (triggerSeconds == 0) return 0;
        uint256 last = FixedToken(token).lastCreatorTransfer();
        return last == 0 ? 0 : last + triggerSeconds;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external view returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (msg.sender != address(manager)) revert InvalidPool();
        validatePool(key);
        FeeRules.Spec memory spec = FeeRules.Spec(buyBps, sellBps, openingBuyBps, openingSellBps, windowSeconds, triggerSellBps, triggerSeconds);
        uint24 fee = FeeRules.fee(spec, !params.zeroForOne, block.timestamp - startsAt);
        uint24 elevated = uint24(triggerSellBps) * 100;
        if (!params.zeroForOne && elevated > fee && block.timestamp < elevatedUntil()) fee = elevated;
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function validatePool(PoolKey calldata key) private view {
        if (Currency.unwrap(key.currency0)!= address(0) ||
            Currency.unwrap(key.currency1) != token || key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG ||
            key.tickSpacing != 60 || address(key.hooks) != address(this)) revert InvalidPool();
    }
}
