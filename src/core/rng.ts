/** Small seeded generator (mulberry32). Same seed, same sequence, everywhere. */
export type Rng = () => number;

export function rng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const int = (random: Rng, min: number, max: number): number =>
    min + Math.floor(random() * (max - min + 1));

export const pick = <T>(random: Rng, items: readonly T[]): T =>
    items[Math.floor(random() * items.length)]!;

export function weighted<T>(random: Rng, items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let roll = random() * total;
    for (const item of items) {
        roll -= weight(item);
        if (roll <= 0) return item;
    }
    return items[items.length - 1]!;
}

export function shuffle<T>(random: Rng, items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}
