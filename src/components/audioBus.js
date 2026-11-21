// Un solo audio alla volta: quando uno parte, quello di prima si ferma.
let current = null;

export function claim(el) {
  if (current && current !== el) {
    try {
      current.pause();
    } catch {
      /* ignorato */
    }
  }
  current = el;
}

export function release(el) {
  if (current === el) current = null;
}
