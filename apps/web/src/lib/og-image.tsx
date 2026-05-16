import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png' as const;

const TEAL = '#439093';
const CREAM = '#F9EBD9';
const DARK = '#0F2A2C';

/**
 * Renders the standard PickupVB Open Graph card: dark teal background,
 * cream title, an accent line, optional eyebrow + metadata footer, and a
 * "PickupVB" wordmark in the corner. Used by every `opengraph-image.tsx`
 * so social cards look consistent.
 *
 * Uses inline styles only — `next/og` (Satori under the hood) does not
 * support Tailwind class names. Keep markup simple: flex layouts and
 * solid colors render reliably.
 */
export function brandOgImage({
    eyebrow,
    title,
    meta,
    cta = 'Join free at pickupvb.com',
}: {
    eyebrow?: string;
    title: string;
    meta?: string;
    /** Call-to-action pill rendered above the footer. Pass `null` to hide. */
    cta?: string | null;
}): ImageResponse {
    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: DARK,
                    backgroundImage:
                        `radial-gradient(circle at 0% 0%, ${TEAL} 0%, transparent 55%),`
                        + `radial-gradient(circle at 100% 100%, ${TEAL}55 0%, transparent 60%)`,
                    padding: '72px',
                    color: CREAM,
                    fontFamily: 'system-ui, sans-serif',
                }}
            >
                {eyebrow ? (
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 28,
                            letterSpacing: 4,
                            textTransform: 'uppercase',
                            color: TEAL,
                            opacity: 0.95,
                        }}
                    >
                        {eyebrow}
                    </div>
                ) : null}
                <div
                    style={{
                        display: 'flex',
                        marginTop: eyebrow ? 24 : 0,
                        fontSize: 84,
                        lineHeight: 1.05,
                        fontWeight: 800,
                        letterSpacing: -1,
                        // Up to ~3 lines of title.
                        maxWidth: '100%',
                    }}
                >
                    {title}
                </div>
                <div style={{ flex: 1 }} />
                {cta ? (
                    <div
                        style={{
                            display: 'flex',
                            alignSelf: 'flex-start',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 24,
                            paddingTop: 14,
                            paddingBottom: 14,
                            paddingLeft: 26,
                            paddingRight: 26,
                            borderRadius: 999,
                            backgroundColor: TEAL,
                            color: CREAM,
                            fontSize: 28,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                        }}
                    >
                        <span>{cta}</span>
                        <span aria-hidden style={{ fontSize: 30 }}>→</span>
                    </div>
                ) : null}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 24,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 30,
                            color: CREAM,
                            opacity: 0.8,
                            maxWidth: '70%',
                        }}
                    >
                        {meta ?? ''}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 64,
                                height: 64,
                                borderRadius: 16,
                                backgroundColor: TEAL,
                                color: CREAM,
                                fontSize: 36,
                                fontWeight: 800,
                            }}
                        >
                            P
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 34,
                                fontWeight: 700,
                                color: CREAM,
                            }}
                        >
                            PickupVB
                        </div>
                    </div>
                </div>
            </div>
        ),
        OG_SIZE,
    );
}
