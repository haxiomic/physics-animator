import { useState } from "react";
import { useSpringValue } from "./useSpringValue.js";
import { Animator } from "../Animator.js";
import { SpringParameters } from "src/animators/SpringAnimator.js";

/**
 * A value that animates to a target value using a spring animation.
 * This **will** cause a re-render when the value changes.
 * 
 * See {@link useSpringValue} for a version that does not cause re-renders.
 */
export function useSpringState<T extends number | number[] | { [field: PropertyKey]: number }>(
    options: {
        animator?: Animator,
        initial: T;
        target: T;
    } & SpringParameters,
) {
    const [state, setState] = useState(options.initial);
    useSpringValue(options, setState);
    return state;
}
