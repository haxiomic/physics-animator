// @ts-check
import { Animator } from "physics-animator";

const animator = new Animator();
animator.startAnimationFrameLoop();

const container = document.getElementById("animation-grid");
if (!container) {
  throw new Error("Container element not found");
}
const columns = 8;
const rows = 8;
const cellSize = 70;
const padding = 3;

container.style.position = "relative";
container.style.width = `${columns * cellSize}px`;
container.style.height = `${rows * cellSize}px`;

const clamp = val => Math.max(0, Math.min(255, val));

for (let i = 0; i < columns; i++) {
  for (let j = 0; j < rows; j++) {
    // const v = j / (rows - 1);
    // const u = (i + 1) / columns;
    const u = (j + 1) / (columns);
    const v = i / (rows - 1);
    let du = u * u;
    let bo = v * v * u;
    const duration_s = 2 * du;
    const bounce = 15 * bo;

    const springParams = { duration_s, bounce };

    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.width = `${cellSize}px`;
    cell.style.height = `${cellSize}px`;
    cell.style.padding = `${padding}px`;
    cell.style.transform = `translate(${i * cellSize}px, ${j * cellSize}px)`;
    container.appendChild(cell);

    const inner = document.createElement("div");
    inner.className = "inner-cell";
    inner.style.width = `${cellSize - 2 * padding}px`;
    inner.style.height = `${cellSize - 2 * padding}px`;
    inner.innerHTML = `
          <label>Duration</label>
          <div class="values">
            <span>${duration_s.toFixed(2)}</span>
            <span>${bounce.toFixed(2)}</span>
          </div>
          <label>Bounce</label>
        `;

    /** @type {HTMLDivElement | null} */
    const valuesDiv = inner.querySelector(".values");
    if (!valuesDiv) {
      throw new Error("Values div not found in inner cell");
    }
    
    const hue = du * 240 + bo * 120;
    const saturation = 0.6 + bo * 0.6;
    const lightness = 0.7 - du * 0.2;

    function cosineMix(h, offset, lightness, saturation) {
      return lightness + saturation * Math.cos((h + offset) * Math.PI / 180) * 0.3;
    }

    const r = clamp(Math.floor(255 * cosineMix(hue, 0, lightness, saturation)));
    const g = clamp(Math.floor(255 * cosineMix(hue, 120, lightness, saturation)));
    const b = clamp(Math.floor(255 * cosineMix(hue, 240, lightness, saturation)));

    inner.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    inner.style.color = `rgb(
      ${clamp(Math.floor(255 * cosineMix(hue, 0, lightness * 0.5, saturation * 1.5)))},
      ${clamp(Math.floor(255 * cosineMix(hue, 120, lightness * 0.5, saturation * 1.5)))},
      ${clamp(Math.floor(255 * cosineMix(hue, 240, lightness * 0.5, saturation * 1.5)))}
    )`;
    valuesDiv.style.color = `rgb(
      ${clamp(Math.floor(255 * cosineMix(hue, 0, lightness * .25, saturation * 1.5)))},
      ${clamp(Math.floor(255 * cosineMix(hue, 120, lightness * .25, saturation * 1.5)))},
      ${clamp(Math.floor(255 * cosineMix(hue, 240, lightness * .25, saturation * 1.5)))}
    )`;

    cell.appendChild(inner);

    const defaultState = {
      scale: 1,
      opacity: 0.5,
      zIndex: 0,
      shadowOpacity: 0.0,
      rotation_deg: 0,
      rgb: [r, g, b],
    };

    const hoveredState = {
      scale: 1.5,
      opacity: 1.0,
      zIndex: 10,
      shadowOpacity: 0.2,
      rgb: [
        clamp(Math.floor(255 * cosineMix(hue, 0, lightness * 1.1, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 120, lightness * 1.1, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 240, lightness * 1.1, saturation * 1.5))),
      ]
    };

    const selectedState = {
      scale: 4.0,
      opacity: 1.0,
      zIndex: 20,
      shadowOpacity: 0.4,
      rgb: [
        clamp(Math.floor(255 * cosineMix(hue, 0, lightness * 1.2, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 120, lightness * 1.2, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 240, lightness * 1.2, saturation * 1.5))),
      ]
    };

    const colorOffset = 0; // Offset for double selected state
    const doubleSelectedState = {
      scale: 5,
      rgb: [
        clamp(Math.floor(255 * cosineMix(hue, 0 + colorOffset, lightness * 1.3, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 120 + colorOffset, lightness * 1.3, saturation * 1.5))),
        clamp(Math.floor(255 * cosineMix(hue, 240 + colorOffset, lightness * 1.3, saturation * 1.5))),
      ]
    }

    const state = structuredClone(defaultState);
    let selectedCount = 0;

    const update = () => {
      inner.style.transform = `scale(${state.scale}) rotate(${state.rotation_deg}deg)`;
      inner.style.opacity = String(state.opacity);
      inner.style.backgroundColor = `rgb(${state.rgb.join(", ")})`;
      cell.style.zIndex = String(Math.max(Math.round(state.zIndex), 0));
    };

    update();
    animator.events.afterStep.addListener(() => update());

    cell.addEventListener("mouseenter", (e) => {
      animator.springTo(state, (selectedCount ? selectedState : hoveredState), springParams);
    });

    cell.addEventListener("mouseleave", () => {
      selectedCount = 0;
      animator.springTo(state, defaultState, springParams);
    });

    cell.addEventListener("click", () => {
      if (selectedCount === 0) {
        animator.springTo(state, selectedState, springParams);
      } else if (selectedCount === 1) {
        // trigger copy of parameters to clipboard
        const params = Object.entries(springParams)
          .map(([key, value]) => `${key}: ${value.toFixed(4)}`)
          .join(", ");
        navigator.clipboard.writeText(`{ ${params} }`)
          .then(() => console.log("Copied to clipboard:", params))
          .catch(err => console.error("Failed to copy:", err));

        animator.springTo(state, doubleSelectedState, springParams);
      } else {
        let newRotation = Math.random() * 360;

        animator.springTo(state, {
          rotation_deg: getNearestAngle(state.rotation_deg, newRotation),
        }, springParams);
      }

      selectedCount++;
    });

    document.addEventListener("keydown", (event) => {
      selectedCount = 0;
      if (event.key === "Escape") {
        for (const key in defaultState) {
          animator.springTo(state, defaultState, springParams);
        }
      }
    });
  }
}

function mod(x, m) {
  return ((x % m) + m) % m;
}

function getNearestAngle(currentAngle, targetAngle) {
  const diff = mod(targetAngle - currentAngle + 180, 360) - 180;
  return currentAngle + diff;
}