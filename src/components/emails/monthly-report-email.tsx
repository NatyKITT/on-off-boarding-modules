import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

export type MonthlyReportRow = {
  name: string
  surname: string
  position: string
  department: string
  date: string
}

export type MonthlyReportEmailProps = {
  monthLabel: string
  kind: "planned" | "actual"
  label?: string
  onboardings: MonthlyReportRow[]
  offboardings: MonthlyReportRow[]
}

export default function MonthlyReportEmail({
  monthLabel,
  kind,
  label,
  onboardings,
  offboardings,
}: MonthlyReportEmailProps) {
  const titleBase = `Měsíční report ${kind === "planned" ? "plánovaných" : "skutečných"} změn – ${monthLabel}`
  const title = label ? `${titleBase} (${label})` : titleBase

  return (
    <Html lang="cs">
      <Head>
        <title>{title}</title>
      </Head>
      <Preview>{title}</Preview>
      <Tailwind>
        <Body className="bg-white font-sans text-black">
          <Container className="mx-auto my-6 w-full max-w-[680px] rounded-lg border border-solid border-gray-200 p-6">
            <Heading className="mb-1 text-2xl font-bold text-gray-900">
              {title}
            </Heading>
            <Text className="mb-6 text-sm text-gray-500">
              Tento přehled byl vygenerován systémem On-Off-Boarding.
            </Text>

            {/* Nástupy */}
            {onboardings.length > 0 && (
              <Section className="mb-6">
                <Heading className="mb-3 text-xl font-semibold text-gray-900">
                  Nástupy{" "}
                  <span className="text-gray-500">({onboardings.length})</span>
                </Heading>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Jméno
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Pozice
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Oddělení
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        {kind === "planned"
                          ? "Plánovaný nástup"
                          : "Skutečný nástup"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {onboardings.map((r, i) => (
                      <tr key={`onb-${i}`} className="border-b border-gray-200">
                        <td className="px-3 py-2 text-sm">
                          {r.name} {r.surname}
                        </td>
                        <td className="px-3 py-2 text-sm">{r.position}</td>
                        <td className="px-3 py-2 text-sm">{r.department}</td>
                        <td className="px-3 py-2 text-sm">
                          {new Date(r.date).toLocaleDateString("cs-CZ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Odchody */}
            {offboardings.length > 0 && (
              <Section className="mb-6">
                <Heading className="mb-3 text-xl font-semibold text-gray-900">
                  Odchody{" "}
                  <span className="text-gray-500">({offboardings.length})</span>
                </Heading>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Jméno
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Pozice
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Oddělení
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        {kind === "planned"
                          ? "Plánovaný odchod"
                          : "Skutečný odchod"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {offboardings.map((r, i) => (
                      <tr key={`off-${i}`} className="border-b border-gray-200">
                        <td className="px-3 py-2 text-sm">
                          {r.name} {r.surname}
                        </td>
                        <td className="px-3 py-2 text-sm">{r.position}</td>
                        <td className="px-3 py-2 text-sm">{r.department}</td>
                        <td className="px-3 py-2 text-sm">
                          {new Date(r.date).toLocaleDateString("cs-CZ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {onboardings.length === 0 && offboardings.length === 0 && (
              <Text className="text-sm text-gray-600">
                Pro vybraný měsíc nejsou žádné položky.
              </Text>
            )}

            <Section className="mt-8 border-t border-gray-200 pt-4">
              <Text className="text-xs text-gray-500">
                Kontakt: hr@firma.cz • Tento e-mail je notifikační,
                neodpovídejte na něj.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
