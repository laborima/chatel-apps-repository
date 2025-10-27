import { ImageResponse } from "next/og";

const gradientBackground = "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)";

export const contentType = "image/png";

export function logoImageResponse(size: number): ImageResponse {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: gradientBackground,
                    borderRadius: "30%",
                }}
            >
                <svg
                    width="70%"
                    height="70%"
                    viewBox="0 0 120 120"
                    xmlns="http://www.w3.org/2000/svg"
                    role="img"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id="logo-sail" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f8fafc" />
                            <stop offset="100%" stopColor="#bae6fd" />
                        </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="56" fill="rgba(255,255,255,0.12)" />
                    <circle cx="60" cy="60" r="52" stroke="#0ea5e9" strokeWidth="4" fill="none" />
                    <path d="M40 78 Q60 28 86 48 Q66 66 62 92 Z" fill="url(#logo-sail)" />
                    <path d="M28 88 H92" stroke="#f8fafc" strokeWidth="6" strokeLinecap="round" />
                    <path d="M36 96 H84" stroke="#bae6fd" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="44" cy="42" r="10" fill="#fde68a" />
                </svg>
            </div>
        ),
        {
            width: size,
            height: size,
        }
    );
}
