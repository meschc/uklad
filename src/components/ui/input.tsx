import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, onBlur, ...props }, ref) => {
    // Ошибку поля держим, пока человек не начал править: первый же набранный
    // символ гасит красное (см. `input[data-typing]` в index.css), уход из
    // поля возвращает проверку формы.
    const [typing, setTyping] = React.useState(false);
    return (
      <input
        type={type}
        ref={ref}
        data-typing={typing || undefined}
        onChange={(e) => {
          setTyping(true);
          onChange?.(e);
        }}
        onBlur={(e) => {
          setTyping(false);
          onBlur?.(e);
        }}
        className={cn(
          "flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Ошибка поля — от `aria-invalid` (его ставит ui/field): красная рамка.
          "aria-[invalid=true]:border-destructive",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
