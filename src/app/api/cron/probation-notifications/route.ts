import { NextResponse } from "next/server"
import { addDays, differenceInDays, isToday } from "date-fns"

import { prisma } from "@/lib/db"

const HR_EMAILS = ["hr@company.com", "manager@company.com"]

export async function POST() {
  try {
    const today = new Date()
    const notifications = []

    // ============ ZKUŠEBNÍ DOBA - NÁSTUPY ============
    const activeEmployees = await prisma.employeeOnboarding.findMany({
      where: {
        deletedAt: null,
        actualStart: { not: null },
        probationEnd: { not: null },
        status: "COMPLETED",
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        userEmail: true,
        probationEnd: true,
        actualStart: true,
        positionName: true,
        department: true,
        lastProbationReminder: true,
        probationRemindersSent: true,
      },
    })

    for (const employee of activeEmployees) {
      if (!employee.probationEnd) continue

      const daysUntilEnd = differenceInDays(employee.probationEnd, today)
      const employeeEmail = employee.userEmail || employee.email

      // Připomínky: 30, 14, 7, 3, 1 den před koncem
      const reminderDays = [30, 14, 7, 3, 1]

      if (reminderDays.includes(daysUntilEnd)) {
        const lastReminder = employee.lastProbationReminder
        const alreadySentToday = lastReminder && isToday(lastReminder)

        if (!alreadySentToday) {
          // E-mail HR oddělení
          const hrMailId = await prisma.mailQueue.create({
            data: {
              type: "PROBATION_WARNING",
              payload: {
                employeeId: employee.id,
                employeeName: `${employee.name} ${employee.surname}`,
                position: employee.positionName,
                department: employee.department,
                probationEndDate: employee.probationEnd.toISOString(),
                daysRemaining: daysUntilEnd,
                recipients: HR_EMAILS,
                subject: `Zkušební doba končí za ${daysUntilEnd} dní - ${employee.name} ${employee.surname}`,
              },
              priority: daysUntilEnd <= 3 ? 2 : 5, // Vyšší priorita blíže konci
              createdBy: "system-cron",
            },
          })

          // E-mail zaměstnanci (pokud má email)
          let employeeMailId = null
          if (employeeEmail) {
            employeeMailId = await prisma.mailQueue.create({
              data: {
                type: "PROBATION_REMINDER",
                payload: {
                  employeeId: employee.id,
                  employeeName: `${employee.name} ${employee.surname}`,
                  position: employee.positionName,
                  probationEndDate: employee.probationEnd.toISOString(),
                  daysRemaining: daysUntilEnd,
                  recipients: [employeeEmail],
                  subject: `Vaše zkušební doba končí za ${daysUntilEnd} ${daysUntilEnd === 1 ? "den" : daysUntilEnd <= 4 ? "dny" : "dní"}`,
                },
                priority: daysUntilEnd <= 3 ? 2 : 5,
                createdBy: "system-cron",
              },
            })
          }

          // Aktualizace záznamu
          await prisma.employeeOnboarding.update({
            where: { id: employee.id },
            data: {
              lastProbationReminder: today,
              probationRemindersSent: employee.probationRemindersSent + 1,
            },
          })

          // Záznam do historie
          await prisma.emailHistory.create({
            data: {
              mailQueueId: hrMailId.id,
              onboardingEmployeeId: employee.id,
              emailType: "PROBATION_WARNING",
              recipients: HR_EMAILS,
              subject: `Zkušební doba končí za ${daysUntilEnd} dní`,
              status: "QUEUED",
              createdBy: "system-cron",
            },
          })

          if (employeeMailId) {
            await prisma.emailHistory.create({
              data: {
                mailQueueId: employeeMailId.id,
                onboardingEmployeeId: employee.id,
                emailType: "PROBATION_REMINDER",
                recipients: [employeeEmail],
                subject: `Zkušební doba končí za ${daysUntilEnd} dní`,
                status: "QUEUED",
                createdBy: "system-cron",
              },
            })
          }

          // Change log
          await prisma.onboardingChangeLog.create({
            data: {
              employeeId: employee.id,
              userId: "system-cron",
              action: "PROBATION_REMINDER_SENT",
              field: "probation_reminder",
              oldValue: null,
              newValue: JSON.stringify({
                daysRemaining: daysUntilEnd,
                sentTo: employeeEmail
                  ? [HR_EMAILS[0], employeeEmail]
                  : HR_EMAILS,
                mailIds: [hrMailId.id, employeeMailId?.id].filter(Boolean),
              }),
            },
          })

          notifications.push({
            type: `probation_${daysUntilEnd}_days`,
            employee: `${employee.name} ${employee.surname}`,
            endDate: employee.probationEnd,
            emailsSent: employeeEmail ? 2 : 1,
          })
        }
      }

      // Poslední den zkušební doby
      if (isToday(employee.probationEnd)) {
        await prisma.mailQueue.create({
          data: {
            type: "PROBATION_ENDING",
            payload: {
              employeeId: employee.id,
              employeeName: `${employee.name} ${employee.surname}`,
              position: employee.positionName,
              department: employee.department,
              probationEndDate: employee.probationEnd.toISOString(),
              recipients: HR_EMAILS,
              subject: `🚨 DNES končí zkušební doba - ${employee.name} ${employee.surname}`,
            },
            priority: 1, // Nejvyšší priorita
            createdBy: "system-cron",
          },
        })

        notifications.push({
          type: "probation_ending_today",
          employee: `${employee.name} ${employee.surname}`,
          endDate: employee.probationEnd,
        })
      }
    }

    // ============ VÝPOVĚDNÍ LHŮTA - ODCHODY ============
    const departingEmployees = await prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: null,
        plannedEnd: { gte: today },
        noticeEnd: { not: null },
      },
      select: {
        id: true,
        name: true,
        surname: true,
        userEmail: true,
        noticeEnd: true,
        positionName: true,
        department: true,
        lastNoticeReminder: true,
        noticeRemindersSent: true,
      },
    })

    for (const employee of departingEmployees) {
      if (!employee.noticeEnd) continue

      const daysUntilEnd = differenceInDays(employee.noticeEnd, today)

      // Připomínky výpovědní lhůty: 14, 7, 3, 1 den před koncem
      const noticeReminderDays = [14, 7, 3, 1]

      if (noticeReminderDays.includes(daysUntilEnd)) {
        const lastReminder = employee.lastNoticeReminder
        const alreadySentToday = lastReminder && isToday(lastReminder)

        if (!alreadySentToday) {
          const hrMailId = await prisma.mailQueue.create({
            data: {
              type: "NOTICE_WARNING",
              payload: {
                employeeId: employee.id,
                employeeName: `${employee.name} ${employee.surname}`,
                position: employee.positionName,
                department: employee.department,
                noticeEndDate: employee.noticeEnd.toISOString(),
                daysRemaining: daysUntilEnd,
                recipients: HR_EMAILS,
                subject: `Výpovědní lhůta končí za ${daysUntilEnd} dní - ${employee.name} ${employee.surname}`,
              },
              priority: daysUntilEnd <= 3 ? 2 : 5,
              createdBy: "system-cron",
            },
          })

          await prisma.employeeOffboarding.update({
            where: { id: employee.id },
            data: {
              lastNoticeReminder: today,
              noticeRemindersSent: employee.noticeRemindersSent + 1,
            },
          })

          await prisma.offboardingChangeLog.create({
            data: {
              employeeId: employee.id,
              userId: "system-cron",
              action: "NOTICE_REMINDER_SENT",
              field: "notice_reminder",
              oldValue: null,
              newValue: JSON.stringify({
                daysRemaining: daysUntilEnd,
                mailId: hrMailId.id,
              }),
            },
          })

          notifications.push({
            type: `notice_${daysUntilEnd}_days`,
            employee: `${employee.name} ${employee.surname}`,
            endDate: employee.noticeEnd,
          })
        }
      }
    }

    return NextResponse.json({
      status: "success",
      message: `Processed ${activeEmployees.length} onboarding + ${departingEmployees.length} offboarding employees`,
      notifications,
      summary: {
        probationNotifications: notifications.filter((n) =>
          n.type.includes("probation")
        ).length,
        noticeNotifications: notifications.filter((n) =>
          n.type.includes("notice")
        ).length,
      },
    })
  } catch (error) {
    console.error("Chyba při zpracování notifikací:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při zpracování notifikací",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// GET endpoint pro náhled nadcházejících notifikací
export async function GET() {
  try {
    const today = new Date()
    const next30Days = addDays(today, 30)

    const [probationEnding, noticeEnding] = await Promise.all([
      // Zkušební doby končící v příštích 30 dnech
      prisma.employeeOnboarding.findMany({
        where: {
          deletedAt: null,
          actualStart: { not: null },
          probationEnd: {
            gte: today,
            lte: next30Days,
          },
          status: "COMPLETED",
        },
        select: {
          id: true,
          name: true,
          surname: true,
          probationEnd: true,
          positionName: true,
          department: true,
          probationRemindersSent: true,
        },
        orderBy: { probationEnd: "asc" },
      }),

      // Výpovědní lhůty končící v příštích 30 dnech
      prisma.employeeOffboarding.findMany({
        where: {
          deletedAt: null,
          noticeEnd: {
            gte: today,
            lte: next30Days,
          },
        },
        select: {
          id: true,
          name: true,
          surname: true,
          noticeEnd: true,
          positionName: true,
          department: true,
          noticeRemindersSent: true,
        },
        orderBy: { noticeEnd: "asc" },
      }),
    ])

    const upcoming = [
      ...probationEnding.map((emp) => ({
        ...emp,
        type: "probation" as const,
        endDate: emp.probationEnd,
        daysUntilEnd: differenceInDays(emp.probationEnd!, today),
      })),
      ...noticeEnding.map((emp) => ({
        ...emp,
        type: "notice" as const,
        endDate: emp.noticeEnd,
        daysUntilEnd: differenceInDays(emp.noticeEnd!, today),
      })),
    ].sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)

    return NextResponse.json({
      status: "success",
      upcoming,
      summary: {
        totalProbationEnding: probationEnding.length,
        totalNoticeEnding: noticeEnding.length,
        next7Days: upcoming.filter((u) => u.daysUntilEnd <= 7).length,
      },
    })
  } catch (error) {
    console.error("Chyba při načítání přehledu:", error)
    return NextResponse.json(
      { status: "error", message: "Chyba při načítání dat" },
      { status: 500 }
    )
  }
}
