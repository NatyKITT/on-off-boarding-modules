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

interface OnboardingNotificationEmailProps {
  employeeName: string
  startDate: string
  position: string
  department: string
}

export function OnboardingNotificationEmail({
  employeeName,
  startDate,
  position,
  department,
}: OnboardingNotificationEmailProps): JSX.Element {
  const previewText = `${employeeName} nastupuje ${startDate}`

  return (
    <Html lang="cs">
      <Head>
        <title>{previewText}</title>
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-white font-sans text-black">
          <Container className="p-6">
            <Section>
              <Heading className="text-xl font-bold">
                Nový nástup zaměstnance
              </Heading>
              <Text>
                <strong>{employeeName}</strong> nastupuje na pozici{" "}
                <strong>{position}</strong> v oddělení{" "}
                <strong>{department}</strong> dne <strong>{startDate}</strong>.
              </Text>
              <Text>Prosím připravte pracovní prostředky a přístupy.</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
