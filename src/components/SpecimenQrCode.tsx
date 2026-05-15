"use client";

import { useEffect, useRef } from "react";

interface Props {
  text: string;
  sizePx?: number;
  /** ECC level — L/M/Q/H. H 가 가장 강하지만 코드 밀도 ↑. 기본 M. */
  ecc?: "L" | "M" | "Q" | "H";
}

// 동적 import 로 qrcode 모듈을 늦게 불러옴. 렌더는 SVG 라 인쇄에 깔끔.
export function SpecimenQrCode({ text, sizePx = 128, ecc = "M" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const QR = (await import("qrcode")).default;
      const svg = await QR.toString(text, {
        type: "svg",
        errorCorrectionLevel: ecc,
        margin: 1,
      });
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = svg.replace(
        "<svg ",
        `<svg width="${sizePx}" height="${sizePx}" `,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [text, sizePx, ecc]);

  return <div ref={ref} className="inline-block leading-none" />;
}
