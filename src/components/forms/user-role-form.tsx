"use client"

import { useState, useTransition } from "react"
import { updateUserRole, type FormData } from "@/actions/update-user-role"
import { zodResolver } from "@hookform/resolvers/zod"
import { Role, User } from "@prisma/client"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { roleSchema } from "@/lib/validations/user"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SectionColumns } from "@/components/dashboard/section-columns"
import { Icons } from "@/components/shared/icons"

interface UserRoleFormProps {
  user: Pick<User, "id" | "role">
}

export function UserRoleForm({ user }: UserRoleFormProps) {
  const { update } = useSession()
  const [updated, setUpdated] = useState(false)
  const [isPending, startTransition] = useTransition()
  const updateUserRoleWithId = updateUserRole.bind(null, user.id)

  const [role, setRole] = useState<Role>(user.role)
  const roles = Object.values(Role)

  const form = useForm<FormData>({
    resolver: zodResolver(roleSchema),
    values: { role },
  })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const { status } = await updateUserRoleWithId(data)

      if (status !== "success") {
        toast.error("Something went wrong.", {
          description: "Your role was not updated. Please try again.",
        })
      } else {
        await update()
        setUpdated(false)
        toast.success("Your role has been updated.")
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <SectionColumns
          title="Your Role"
          description="Select the role you want to test the app with."
        >
          <div className="flex w-full items-center gap-2">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem className="w-full space-y-0">
                  <FormLabel className="sr-only">Role</FormLabel>
                  <Select
                    onValueChange={(value: Role) => {
                      setUpdated(user.role !== value)
                      setRole(value)
                      field.onChange(value)
                    }}
                    value={role}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              variant={updated ? "default" : "disable"}
              disabled={isPending || !updated}
              className="w-[67px] shrink-0 px-0 sm:w-[130px]"
            >
              {isPending ? (
                <Icons.spinner className="size-4 animate-spin" />
              ) : (
                <p>
                  Save
                  <span className="hidden sm:inline-flex">&nbsp;Changes</span>
                </p>
              )}
            </Button>
          </div>
          <div className="flex flex-col justify-between p-1">
            <p className="text-[13px] text-muted-foreground">
              Remove this field in real production
            </p>
          </div>
        </SectionColumns>
      </form>
    </Form>
  )
}
