import { Fragment } from "react";
import { splitCode, splitCodes } from "@/lib/codeTail";
import { cn } from "@/lib/utils";

/**
 * Код целиком, последние 4 знака выделены (`lib/codeTail.ts`): по ним
 * сверяют экран с этикеткой. Цвет — от родителя, чтобы код читался и в
 * зелёной, и в красной полосе скана.
 */
export function CodeTail({ code, className }: { code: string; className?: string }) {
  const { head, tail, rest } = splitCode(code);
  return (
    // Код не рвётся по дефису: «UK-BOX-» / «28» читается как два кода.
    // Неразрывный дефис вместо обычного сломал бы поиск и копирование.
    <span className={cn("whitespace-nowrap font-mono", className)}>
      {head}
      <b className="text-[1.2em] font-extrabold">{tail}</b>
      {rest && <span className="whitespace-normal break-all opacity-60">{rest}</span>}
    </span>
  );
}

/** Сообщение, в котором коды показаны через `CodeTail`. */
export function CodeText({ text }: { text: string }) {
  return (
    <>
      {splitCodes(text).map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <CodeTail key={i} code={p.code} />
        ),
      )}
    </>
  );
}
