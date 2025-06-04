import { useState } from "react";
import { useSpringValue } from "./useSpringValue.js";
import { Animator } from "../Animator.js";
import { SpringParameters } from "../Spring.js";

/**
 * A value that animates to a target value using a spring animation.
 * This **will** cause a re-render when the value changes.
 * 
 * See {@link useSpringValue} for a version that does not cause re-renders.
 */
export function useSpringState(
    options: {
        animator?: Animator; // Animator type can be specified if available
        initial: number;
        target: number;
    } & SpringParameters
) {
    const [state, setState] = useState(options.initial);
    useSpringValue(options, setState);
    return state;
}
