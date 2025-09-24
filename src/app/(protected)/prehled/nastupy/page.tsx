// src/app/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Employee {
  id: string
  name: string
  surname: string
  titleBefore?: string
  titleAfter?: string
  email: string
  department: string
  unit: string
  positionNum: string
  positionName: string
  payGrade: string
  plannedStart: string
  actualStart?: string | null
  userName?: string
  userEmail?: string
  itStatus?: string
  notes?: string
}

export default function DashboardPage() {
  const [planned, setPlanned] = useState<Employee[]>([])
  const [actual, setActual] = useState<Employee[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  useEffect(() => {
    fetch("https://systematizace.kitt6.dev/api/1.0/position/list?detail=1")
      .then((res) => res.json())
      .then((json) => {
        console.log("Pozice z API:", json)
      })

    const example: Employee[] = [
      {
        id: "1",
        name: "Roman",
        surname: "Vodný",
        titleBefore: "Ing.",
        titleAfter: "Ph.D.",
        email: "vodny@firma.cz",
        department: "Odbor rozvoje a investic",
        unit: "Oddělení projektů",
        positionNum: "010001",
        positionName: "Projektový manažer",
        payGrade: "11",
        plannedStart: "2025-08-12",
        actualStart: null,
      },
      {
        id: "2",
        name: "Iva",
        surname: "Dvořáková",
        titleAfter: "MBA",
        email: "dvorakova@firma.cz",
        department: "Kancelář tajemníka",
        unit: "Sekretariát",
        positionNum: "020002",
        positionName: "Asistentka vedení",
        payGrade: "9",
        plannedStart: "2025-08-12",
        actualStart: "2025-08-12",
        userName: "iva.dvorakova",
        userEmail: "iva.dvorakova@firma.cz",
        itStatus: "Zřízeno",
      },
    ]
    setPlanned(example.filter((e) => !e.actualStart))
    setActual(example.filter((e) => e.actualStart))
  }, [])

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Nástupy zaměstnanců</h1>
      <Tabs defaultValue="planned">
        <TabsList>
          <TabsTrigger value="planned">Předpokládané nástupy</TabsTrigger>
          <TabsTrigger value="actual">Skutečné nástupy</TabsTrigger>
        </TabsList>

        <TabsContent value="planned">
          <Accordion type="multiple">
            {[...new Set(planned.map((e) => e.plannedStart.slice(0, 7)))].map(
              (month) => (
                <AccordionItem value={month} key={month}>
                  <AccordionTrigger>{month}</AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Jméno</TableHead>
                              <TableHead>Pozice</TableHead>
                              <TableHead>Odbor</TableHead>
                              <TableHead>Oddělení</TableHead>
                              <TableHead>Platová třída</TableHead>
                              <TableHead>Datum nástupu</TableHead>
                              <TableHead>E-mail</TableHead>
                              <TableHead>Akce</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {planned
                              .filter((e) => e.plannedStart.startsWith(month))
                              .map((e) => (
                                <TableRow key={e.id}>
                                  <TableCell>{`${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`}</TableCell>
                                  <TableCell>{e.positionName}</TableCell>
                                  <TableCell>{e.department}</TableCell>
                                  <TableCell>{e.unit}</TableCell>
                                  <TableCell>{e.payGrade}</TableCell>
                                  <TableCell>
                                    {format(
                                      new Date(e.plannedStart),
                                      "d.M.yyyy"
                                    )}
                                  </TableCell>
                                  <TableCell>{e.email}</TableCell>
                                  <TableCell>
                                    <Button size="sm">Detail</Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )
            )}
          </Accordion>
        </TabsContent>

        <TabsContent value="actual">
          <Accordion type="multiple">
            {[...new Set(actual.map((e) => e.actualStart?.slice(0, 7)))].map(
              (month) => (
                <AccordionItem value={month!} key={month}>
                  <AccordionTrigger>{month}</AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Jméno</TableHead>
                              <TableHead>Pozice</TableHead>
                              <TableHead>Odbor</TableHead>
                              <TableHead>Oddělení</TableHead>
                              <TableHead>Platová třída</TableHead>
                              <TableHead>Datum nástupu</TableHead>
                              <TableHead>Uživatelské jméno</TableHead>
                              <TableHead>Firemní e-mail</TableHead>
                              <TableHead>IT stav</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {actual
                              .filter((e) => e.actualStart?.startsWith(month!))
                              .map((e) => (
                                <TableRow key={e.id}>
                                  <TableCell>{`${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`}</TableCell>
                                  <TableCell>{e.positionName}</TableCell>
                                  <TableCell>{e.department}</TableCell>
                                  <TableCell>{e.unit}</TableCell>
                                  <TableCell>{e.payGrade}</TableCell>
                                  <TableCell>
                                    {format(
                                      new Date(e.actualStart!),
                                      "d.M.yyyy"
                                    )}
                                  </TableCell>
                                  <TableCell>{e.userName ?? "–"}</TableCell>
                                  <TableCell>{e.userEmail ?? "–"}</TableCell>
                                  <TableCell>{e.itStatus ?? "–"}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )
            )}
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  )
}
