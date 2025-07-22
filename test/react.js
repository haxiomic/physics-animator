// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpringState, useSpringValue } from 'physics-animator/react';

function App() {
    const { state: ballX, setTarget } = useSpringState({
        initial: 0,
        duration_s: 1,
    });

    /** @type {React.RefObject<HTMLDivElement | null>} */
    const boxRef = useRef(null);
    const [boxTarget, setBoxTarget] = useState(0);
    useSpringValue({
        initial: 0,
        duration_s: 1,
        target: boxTarget
    }, (value) => {
        if (boxRef.current) {
            boxRef.current.style.transform = `translateX(${value * 500}px)`;
        }
    })

    return React.createElement('div', { className: 'app' }, [
        // red ball
        React.createElement('div', {
            className: 'ball',
            style: {
                transform: `translateX(${ballX * 500}px)`,
                willChange: 'transform',
                cursor: 'pointer',
            },
            onClick: () => setTarget(Math.random()),
            // onMouseEnter: () => setTarget(Math.random()),
        }),
        // box ball
        React.createElement('div', {
            ref: boxRef,
            className: 'box',
            style: {
                transform: `translateX(0px)`,
                willChange: 'transform',
                cursor: 'pointer',
            },
            onClick: () => setBoxTarget(Math.random()),
            // onMouseEnter: () => setBoxTarget(Math.random()),
        }),
    ]);
}

let rootEl = document.createElement('div');
rootEl.id = 'root';
document.body.appendChild(rootEl);
const root = createRoot(rootEl);
root.render(React.createElement(App));