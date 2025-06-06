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
     * It can be loosely through of roughly the number of oscillations it will take to reach the target
     */
    bounce: number,
};

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
        // solved numerically
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
        // 4k - b^2 > 0
        let bSq = damping * damping;
        const criticalStrength = bSq / 4;
        let strength = criticalStrength + (bounce * bounce + 1); 
        return { damping, strength };
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