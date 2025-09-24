import localFont from "next/font/local"

export const fontSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./CivilPremium-Thin2.woff2", weight: "100", style: "normal" },
    { path: "./CivilPremium-Thin2.woff", weight: "100", style: "normal" },
    { path: "./CivilPremium-Light2.woff2", weight: "300", style: "normal" },
    { path: "./CivilPremium-Light2.woff", weight: "300", style: "normal" },
    { path: "./CivilPremium-Regular2.woff2", weight: "400", style: "normal" },
    { path: "./CivilPremium-Regular2.woff", weight: "400", style: "normal" },
    { path: "./CivilPremium-Medium2.woff2", weight: "500", style: "normal" },
    { path: "./CivilPremium-Medium2.woff", weight: "500", style: "normal" },
    { path: "./CivilPremium-SemiBold2.woff2", weight: "600", style: "normal" },
    { path: "./CivilPremium-SemiBold2.woff", weight: "600", style: "normal" },
    { path: "./CivilPremium-Bold2.woff2", weight: "700", style: "normal" },
    { path: "./CivilPremium-Bold2.woff", weight: "700", style: "normal" },
  ],
})

export const fontHeading = localFont({
  variable: "--font-heading",
  display: "swap",
  src: [
    { path: "./CivilPremium-SemiBold2.woff2", weight: "600", style: "normal" },
    { path: "./CivilPremium-SemiBold2.woff", weight: "600", style: "normal" },
  ],
})
