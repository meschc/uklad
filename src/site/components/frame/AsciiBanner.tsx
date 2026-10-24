import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { AsciiScene, type SceneKind } from "./AsciiScene";

/**
 * Синий баннер под шапкой, со сценой из знаков по назначению страницы
 * (`AsciiScene`): правовой раздел — листы документов, контакты — трубки и
 * конверты. Скруглён снизу, как первый экран страницы для складов, но ниже и
 * спокойнее: здесь пришли читать или написать, а не выбирать.
 */
export function AsciiBanner({
  scene,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  scene: SceneKind;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-print="hide"
      className={cn(
        "relative overflow-hidden rounded-b-[24px] bg-[var(--wh-blue)] text-white sm:rounded-b-[32px]",
        className,
      )}
    >
      <AsciiScene kind={scene} />
      {/* Под текстом сцена приглушена: строки должны читаться. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--wh-blue)_0%,color-mix(in_srgb,var(--wh-blue)_70%,transparent)_45%,transparent_75%)]"
      />
      <Reveal className="relative mx-auto max-w-[1280px] px-5 pb-[clamp(48px,7vw,96px)] pt-[clamp(40px,6vw,80px)] sm:px-10">
        {eyebrow && <div className="mb-5 text-sm text-white/75">{eyebrow}</div>}
        <h1 className="max-w-[20ch] text-[clamp(36px,4.4vw,60px)] font-normal leading-[1] tracking-[-0.045em] [text-wrap:balance]">
          {title}
        </h1>
        {lead && (
          <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.55] text-white/85">{lead}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </Reveal>
    </section>
  );
}
