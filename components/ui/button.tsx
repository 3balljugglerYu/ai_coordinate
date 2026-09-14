import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        info:
          "bg-info text-info-foreground hover:bg-info-hover focus-visible:ring-info/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  pending = false,
  disabled,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * 処理中。回転を出し、押しても何も起きないようにする。
     *
     * ⭐ native の `disabled` にはしない。フォーカスされている要素を disabled に
     * するとフォーカスが body に落ち、支援技術の利用者が現在位置を見失う。
     * 代わりに `aria-disabled` + `aria-busy` を付け、クリックをここで止める
     * （`aria-disabled` だけでは押せてしまうため、この組み合わせが必須）。
     *
     * `disabled` とは意味が違うので使い分ける。`disabled` は「まだ押せる状態に
     * なっていない」（入力が足りない等）、`pending` は「押した結果を処理中」。
     * 両方を1つの式にまとめると、入力が足りないだけのボタンまで回り続ける。
     */
    pending?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  /*
    asChild のとき Slot は子を1つしか受け取れない。`{null}{children}` でも
    子が配列になって React.Children.only が落ちるので、差し込むときだけ
    フラグメントで包んで渡す。
  */
  const content =
    pending && !asChild ? (
      <>
        <Loader2 className="animate-spin" aria-hidden />
        {children}
      </>
    ) : (
      children
    )

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        pending && "opacity-70"
      )}
      disabled={disabled}
      // native の disabled が付いているときは冗長になるので重ねない
      aria-disabled={pending && !disabled ? true : undefined}
      aria-busy={pending ? true : undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
