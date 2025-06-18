import { IFieldAnimator, StepResult } from "../IFieldAnimator.js";

const defaultSpringParameters = {
    duration_s: 0.5,
}

export const SpringAnimator: IFieldAnimator<SpringParameters, SpringState, number> = {

    createState(obj, field, target, params) {
        return {
            x: obj[field],
            targetX: target,
            v: 0,
            physicsParameters: Spring.getPhysicsParameters(params ?? defaultSpringParameters),
        }
    },

    updateState(state, object, field, target, params) {
        state.x = object[field];
        state.targetX = target as number;
        state.physicsParameters = Spring.getPhysicsParameters(params ?? defaultSpringParameters);
    },

    step(state, object, field, params, dt_s) {
        let physicsParameters = state.physicsParameters;

        // step the spring
        if (physicsParameters != null && isFinite(physicsParameters.strength) && isFinite(physicsParameters.damping)) {
            Spring.stepSpring(dt_s, state, physicsParameters);
        } else {
            // instant transition: set to the target
            state.x = state.targetX;
            state.v = 0;
        }
    
        // update the object
        (object[field] as number) = state.x;

        // complete the animation if it's close enough to the target and velocity is close to 0
        if (Math.abs(state.x - state.targetX) < 0.0001 && Math.abs(state.v) < 0.0001) {
            (object[field] as number) = state.targetX;
            return StepResult.Complete;
        } else {
            return StepResult.Continue;
        }
    }

}

/**
 * Spring
 * 
 * @author George Corney (haxiomic)
 */

type ExponentialParameters = {
    /** Defined as the point in time we'll reach within 0.01% of target from 0 velocity start */
    duration_s: number,
}

type UnderdampedParameters = {
    /** Defined as the point in time we'll reach within 0.01% of target from 0 velocity start */
    duration_s: number,
    /**
     * How soft / bouncy the spring, at 0 there is no bounce and decay is exponential, from 0 to infinity the spring will overshoot its target while decaying
     * It can be thought of roughly the number of oscillations it will take to reach the target
     */
    bounce: number,
};

type SpringState = {
    x: number,
    targetX: number,
    v: number,
    physicsParameters: Spring.PhysicsParameters,
}

export type SpringParameters = ExponentialParameters | UnderdampedParameters | Spring.PhysicsParameters;

export namespace Spring {

    export type PhysicsParameters = {
        strength: number,
        damping: number,
    }

    /**
     * Starting with 0 velocity, this parameter describes how long it would take to reach half-way to the target
     * 
     * `damping = 3.356694 / approxHalfLife_s`
     * 
     * `strength = damping * damping / 4`
     */
    export function Exponential(options: ExponentialParameters): PhysicsParameters {
        // found numerically
        const halfLifeConstant = 3.356694; // from solve (1+u)*exp(-u)=0.5 for u, and constant = 2u
        const pointOnePercentConstant = 18.46682; // from solve (1+u)*exp(-u)=0.001 for u, and constant = 2u
        const damping = pointOnePercentConstant / options.duration_s;

        let strength = damping * damping / 4;
        return { damping, strength };
    }

    export function Underdamped(options: UnderdampedParameters): PhysicsParameters {
        const { duration_s, bounce } = options;
        // -2ln(0.001) = b t
        const durationTarget = 0.001; // 0.1% of target
        let damping = -2 * Math.log(durationTarget) / duration_s;
        
        // see https://www.desmos.com/calculator/h43ylohte7
        const strength = 0.25 * (((2 * bounce * Math.PI) / duration_s) ** 2 + damping ** 2);
        return {
            damping,
            strength,
        }
    }

    export function getPhysicsParameters(
        parameters: SpringParameters
    ): PhysicsParameters {
        if ('duration_s' in parameters) {
            if ('bounce' in parameters) {
                return Underdamped(parameters);
            } else {
                return Exponential(parameters);
            }
        } else {
            // assume physics parameters
            return parameters as PhysicsParameters;
        }
    }

    /**
     * Analytic spring integration
     * @param dt_s 
     * @param state 
     * @param parameters
     * 
     * If parameters are NaN or infinite, the spring will skip to the target
     */
    export function stepSpring(
        dt_s: number,
        state: {
            x: number,
            targetX: number,
            v: number,
        },
        parameters: PhysicsParameters
    ) {
        // analytic integration (unconditionally stable)
        // visualization: https://www.desmos.com/calculator/c2iug0kerh
        // references:
        // https://mathworld.wolfram.com/OverdampedSimpleHarmonicMotion.html
        // https://mathworld.wolfram.com/CriticallyDampedSimpleHarmonicMotion.html
        // https://mathworld.wolfram.com/UnderdampedSimpleHarmonicMotion.html

        let k = parameters.strength;
        let b = parameters.damping;
        let t = dt_s;
        let v0 = state.v;
        let dx0 = state.x - state.targetX;

        // nothing will change; exit early
        if (dx0 === 0 && v0 === 0) return;
        if (dt_s === 0) return;

        if (!isFinite(k) || !isFinite(b) || !isFinite(v0) || !isFinite(dx0)) {
            // skip to target
            state.x = state.targetX;
            state.v = 0;
            return 0; // no energy
        }

        let critical = k * 4 - b * b;

        if (critical > 0) {
            // under damped
            let q = 0.5 * Math.sqrt(critical); // γ

            let A = dx0;
            let B = ((b * dx0) * 0.5 + v0) / q;

            let m = Math.exp(-b * 0.5 * t);
            let c = Math.cos(q * t);
            let s = Math.sin(q * t);

            let dx1 = m * (A*c + B*s);
            let v1 = m * (
                ( B*q - 0.5*A*b) * c +
                (-A*q - 0.5*b*B) * s
            );

            state.v = v1;
            state.x = dx1 + state.targetX;
        } else if (critical < 0) {
            // over damped
            let u = 0.5 * Math.sqrt(-critical);
            let p = -0.5 * b + u;
            let n = -0.5 * b - u;
            let B = -(n*dx0 - v0)/(2*u);
            let A = dx0 - B;

            let ep = Math.exp(p * t);
            let en = Math.exp(n * t);

            let dx1 = A * en + B * ep;
            let v1 = A * n * en + B * p * ep;

            state.v = v1;
            state.x = dx1 + state.targetX;
        } else {
            // critically damped
            let w = Math.sqrt(k); // ω

            let A = dx0;
            let B = v0 + w * dx0;
            let e = Math.exp(-w * t);

            let dx1 = (A + B * t) * e;
            let v1 = (B - w * (A + B * t)) * e;

            state.v = v1;
            state.x = dx1 + state.targetX;
        }

        return 0.5 * k * state.x * state.x;
    }

}