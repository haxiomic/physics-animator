import { useState } from "react";
import { useSpringValue } from "./useSpringValue.js";
import { Animator } from "../Animator.js";
import { SpringParameters } from "../animators/SpringAnimator.js";

type WidenNumber<T> = T extends number ? number : T;


/**
 * A value that animates to a target value using a spring animation.
 * This **will** cause a re-render when the value changes.
 * 
 * Usage example:
 * ```tsx
 * const opacity = useSpringState({ initial: 0, target: 1, duration_s: 0.8 });
 * ```
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
    type N = WidenNumber<T>;
    const [state, setState] = useState<N>(options.initial as N);
    useSpringValue<N>({
        ...options,
        initial: options.initial as N,
        target: options.target as N,
    }, setState);
    return state;
}
