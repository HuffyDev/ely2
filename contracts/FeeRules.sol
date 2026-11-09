// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library FeeRules {
    uint16 internal constant CAP = 500;
    uint32 internal constant MAX_WINDOW = 1 days;

    struct Spec {
        uint16 buyBps;
        uint16 sellBps;
        uint16 openingBuyBps;
        uint16 openingSellBps;
        uint32 windowSeconds;
        uint16 triggerSellBps;
        uint32 triggerSeconds;
    }

    error InvalidSpec();

    function validate(Spec memory spec) internal pure {
        if (
            spec.buyBps > CAP || spec.sellBps > CAP ||
            spec.openingBuyBps > CAP || spec.openingSellBps > CAP ||
            spec.windowSeconds > MAX_WINDOW || spec.triggerSeconds > MAX_WINDOW || spec.triggerSellBps > CAP || (spec.triggerSeconds == 0 && spec.triggerSellBps != 0) || (spec.triggerSeconds != 0 && spec.triggerSellBps <= spec.sellBps) ||
            (spec.windowSeconds == 0 && (spec.openingBuyBps != 0 || spec.openingSellBps != 0))
        ) revert InvalidSpec();
    }

    function fee(Spec memory spec, bool sell, uint256 elapsed) internal pure returns (uint24) {
        if (elapsed < spec.windowSeconds) {
            return uint24(sell ? spec.openingSellBps : spec.openingBuyBps) * 100;
        }
        return uint24(sell ? spec.sellBps : spec.buyBps) * 100;
    }
}
