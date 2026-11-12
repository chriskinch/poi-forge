import type { ReactNode } from "react";

interface Props {
    title: string;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: Props) {
    return (
        <div
            className="backdrop"
            onPointerDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
                <header>
                    <h2>{title}</h2>
                    <button className="ghost" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </header>
                {children}
            </div>
        </div>
    );
}

interface NumberProps {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
    title?: string;
}

export function NumberField({ label, value, min, max, step, onChange, title }: NumberProps) {
    return (
        <label className="field" title={title}>
            <span>{label}</span>
            <input
                type="number"
                value={Number.isFinite(value) ? value : ""}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    if (event.target.value === "" || Number.isNaN(next)) return;
                    onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next)));
                }}
            />
        </label>
    );
}
