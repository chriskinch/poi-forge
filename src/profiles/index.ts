import type { Profile } from "../core/profile";
import { generic } from "./generic";
import { phasercraft } from "./phasercraft";

export const PROFILES: Record<string, Profile> = { generic, phasercraft };

export const profileById = (id: string): Profile => PROFILES[id] ?? generic;
