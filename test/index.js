import { Animator } from "../dist/esm/index.js";

const animator = new Animator();

animator.startAnimationFrameLoop();

const container = document.createElement("div");
container.style.position = "relative";
document.body.appendChild(container);

const padding = 2;
const columns = 30;
const rows = 10;
const cellSize = 50; // Size of each cell in pixels

for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
        const element = document.createElement("div");
        element.style.width = "50px";
        element.style.height = "50px";
        // element.style.backgroundColor = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;
        element.style.position = "absolute";
        element.style.left = "0";
        element.style.top = "0";
        element.style.transform = `translate(${i * cellSize}px, ${j * cellSize}px)`;
        // element.style.outline = "1px solid black";
        container.appendChild(element);

        const innerElement = document.createElement("div");
        innerElement.style.width = (cellSize - padding * 2) + "px";
        innerElement.style.height = (cellSize - padding * 2) + "px";
        innerElement.style.left = padding + "px";
        innerElement.style.top = padding + "px";
        innerElement.style.position = "absolute";
        const r = (i / columns);
        const g = (j / rows);
        const b = ((i + j) / (columns + rows));
        innerElement.style.backgroundColor = `rgb(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)})`;
        element.appendChild(innerElement);

        // state
        const state = {
            scale: 1,
            rotation_rad: 0,
            opacity: 0.5,
            r, g, b,
            borderRadius: 0,
            zIndex: 0
        }

        function update() {
            innerElement.style.transform = `scale(${state.scale}) rotate(${state.rotation_rad}rad)`;
            innerElement.style.backgroundColor = `rgb(${Math.floor(state.r * 255)}, ${Math.floor(state.g * 255)}, ${Math.floor(state.b * 255)})`;
            innerElement.style.opacity = state.opacity;
            innerElement.style.borderRadius = `${state.borderRadius}px`;
            element.style.zIndex = Math.round(state.zIndex);
        }

        update();
        
        animator.onAfterStep.addListener(e => update());

        const duration_s = i / columns;
        const bounce = (j / rows) ;
        const springParams = {
            duration_s,
            bounce,
        }

        element.addEventListener('mouseover', () => {
            animator.springTo(state, 'scale', 2, springParams);
            animator.springTo(state, 'opacity', 1.0, springParams);
            let newR = i / columns;
            let newG = j / rows;
            let newB = ((i + j) / (columns + rows));
            animator.springTo(state, 'r', newR, springParams);
            animator.springTo(state, 'g', newG, springParams);
            animator.springTo(state, 'b', newB, springParams);
            animator.springTo(state, 'borderRadius', 10, springParams);
            animator.springTo(state, 'zIndex', 10, springParams);
            // animator.springTo(state, 'rotation_rad', Math.PI, springParams);
        });

        element.addEventListener('mouseout', () => {
            animator.springTo(state, 'scale', 1, springParams);
            animator.springTo(state, 'opacity', 0.5, springParams);
            animator.springTo(state, 'r', r, springParams);
            animator.springTo(state, 'g', g, springParams);
            animator.springTo(state, 'b', b, springParams);
            animator.springTo(state, 'borderRadius', 0, springParams);
            animator.springTo(state, 'zIndex', 0, springParams);
        });
    }
}