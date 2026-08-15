export interface HeapEvent {
  t: number;
  seq: number;
  run: () => void;
}

/**
 * Binary min-heap ordered by (t, seq). The seq tiebreaker makes event order —
 * and therefore the whole simulation — deterministic.
 */
export class EventHeap {
  private items: HeapEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  push(ev: HeapEvent): void {
    const a = this.items;
    a.push(ev);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(a[i]!, a[parent]!)) {
        [a[i], a[parent]] = [a[parent]!, a[i]!];
        i = parent;
      } else {
        break;
      }
    }
  }

  pop(): HeapEvent | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < a.length && this.less(a[l]!, a[smallest]!)) smallest = l;
        if (r < a.length && this.less(a[r]!, a[smallest]!)) smallest = r;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest]!, a[i]!];
        i = smallest;
      }
    }
    return top;
  }

  private less(x: HeapEvent, y: HeapEvent): boolean {
    return x.t < y.t || (x.t === y.t && x.seq < y.seq);
  }
}
