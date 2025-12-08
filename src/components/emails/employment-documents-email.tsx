import * as React from "react"
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

type EmploymentDocumentsEmailProps = {
  employeeName?: string
  docs: { label: string; url: string }[]
}

export default function EmploymentDocumentsEmail({
  employeeName,
  docs,
}: EmploymentDocumentsEmailProps) {
  const greetingName =
    employeeName && employeeName.trim().length > 0
      ? ` ${employeeName.trim()}`
      : ""

  return (
    <Html lang="cs">
      <Head />
      <Preview>Dokumenty k nástupu – MČ Praha 6</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Dokumenty k nástupu</Heading>

          <Text style={textStyle}>Dobrý den{greetingName},</Text>

          <Text style={textStyle}>
            byly Vám přiděleny následující dokumenty k vyplnění:
          </Text>

          <Section style={{ marginBottom: "16px" }}>
            {docs.map((doc) => (
              <Text key={doc.url} style={listItemStyle}>
                • {doc.label}:{" "}
                <Link href={doc.url} style={linkStyle}>
                  {doc.url}
                </Link>
              </Text>
            ))}
          </Section>

          <Text style={hintStyle}>
            Pokud odkazy nefungují po kliknutí, zkopírujte je prosím do
            adresního řádku svého prohlížeče.
          </Text>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            S pozdravem,
            <br />
            Úřad městské části Praha 6
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f3f4f6",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const containerStyle: React.CSSProperties = {
  margin: "24px auto",
  padding: "24px",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  maxWidth: "600px",
}

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  marginBottom: "16px",
}

const textStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 8px",
}

const listItemStyle: React.CSSProperties = {
  fontSize: "14px",
  margin: "0 0 4px",
}

const hintStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "8px 0 16px",
}

const footerStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#4b5563",
}

const linkStyle: React.CSSProperties = {
  color: "#166534",
  textDecoration: "underline",
}

const hrStyle: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "16px 0",
}
