"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const formSchema = z.object({
  fullName: z.string().min(1, "Jméno je povinné"),
  email: z.string().email("Neplatný e-mail"),
  position: z.string().min(1, "Pozice je povinná"),
  startDate: z.string().min(1, "Datum nástupu je povinné"),
  manager: z.string().min(1, "Zadejte nadřízeného"),
  department: z.enum(["IT", "HR", "Finance", "Operations", "Jiné"]),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export function NewOnboardingForm(): JSX.Element {
  const { toast } = useToast()
  const [isPending, startTransition] = React.useTransition()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      position: "",
      startDate: "",
      manager: "",
      department: "IT",
      notes: "",
    },
  })

  function onSubmit(data: FormData): void {
    startTransition(async () => {
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        if (!res.ok) throw new Error("Chyba při odesílání")

        toast({ title: "Úspěch", description: "Zaměstnanec byl přidán" })
        form.reset()
      } catch (error) {
        console.error(error)
        toast({
          title: "Chyba",
          description: "Zkuste to prosím znovu",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          name="fullName"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Celé jméno</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="email"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pracovní e-mail</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="position"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pozice</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="startDate"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Datum nástupu</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="manager"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nadřízený</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="department"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Oddělení</FormLabel>
              <FormControl>
                <select {...field} className="w-full rounded-md border p-2">
                  <option value="IT">IT</option>
                  <option value="HR">HR</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                  <option value="Jiné">Jiné</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="notes"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Poznámka</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Odesílání..." : "Přidat zaměstnance"}
        </Button>
      </form>
    </Form>
  )
}
