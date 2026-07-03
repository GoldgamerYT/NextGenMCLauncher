import React, { useRef } from 'react';
import clsx from 'clsx';

interface Props {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    /** Tailwind gradient/color class for the filled bar, e.g. "from-blue-600 to-cyan-400" */
    fillClassName?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Pixel-accurate custom slider.
 *
 * Why not <input type="range">:
 * Chromium's native range thumb is ~16 px wide; the browser offsets the
 * usable range by half-thumb on each side so the thumb never overflows the
 * element.  That means a click at x=0 does NOT map to `min` — it maps to
 * roughly min + 8px/width * (max-min).  We fix this by handling pointer
 * events ourselves on the actual track element.
 */
export function CustomSlider({
    min, max, step, value, onChange,
    fillClassName = 'bg-gradient-to-r from-blue-600 to-cyan-400',
    disabled = false,
    className,
}: Props) {
    const trackRef = useRef<HTMLDivElement>(null);

    /** Clamp + snap a raw clientX to the nearest valid stepped value. */
    const resolve = (clientX: number): number => {
        if (!trackRef.current) return value;
        const { left, width } = trackRef.current.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (clientX - left) / width));
        const raw  = min + pct * (max - min);
        const snap = Math.round(raw / step) * step;
        return Math.max(min, Math.min(max, snap));
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        // Capture so pointermove keeps firing even if cursor leaves the element
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(resolve(e.clientX));
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        // e.buttons & 1 → primary button is held
        if (disabled || !(e.buttons & 1)) return;
        onChange(resolve(e.clientX));
    };

    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <div
            ref={trackRef}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            className={clsx(
                'relative h-5 flex items-center select-none touch-none',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                className,
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onKeyDown={e => {
                if (disabled) return;
                if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')
                    onChange(Math.max(min, value - step));
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
                    onChange(Math.min(max, value + step));
                if (e.key === 'Home') onChange(min);
                if (e.key === 'End')  onChange(max);
            }}
        >
            {/* Track background */}
            <div
                className="absolute w-full h-2 rounded-full border pointer-events-none"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'var(--border)' }}
            />

            {/* Filled portion */}
            <div
                className={clsx('absolute h-2 rounded-full bg-gradient-to-r pointer-events-none', fillClassName)}
                style={{ width: `${pct}%` }}
            />

            {/* Thumb — translateX(-50%) centres it exactly on the pct line */}
            <div
                className="absolute w-4 h-4 rounded-full border-2 shadow-md pointer-events-none z-10"
                style={{
                    left: `${pct}%`,
                    transform: 'translateX(-50%)',
                    backgroundColor: 'var(--surface2)',
                    borderColor: 'var(--border)',
                }}
            />
        </div>
    );
}
