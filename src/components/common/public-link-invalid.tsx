import Image from "next/image"

type Props = {
  title?: string
  description: string
  fullPage?: boolean
}

export function PublicLinkInvalid({
  title = "Odkaz není platný",
  description,
  fullPage = true,
}: Props) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center"
          : "flex flex-col items-center px-4 py-10 text-center"
      }
    >
      <Image
        src="/assets/illustrations/praha6_help.svg"
        alt=""
        width={243}
        height={167}
        className="pointer-events-none mb-4 h-auto w-full max-w-[200px]"
      />

      <h1 className="text-2xl font-bold">{title}</h1>

      <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
    </div>
  )
}
