import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { query } from "@/lib/db"
import { apiError } from "@/lib/http"

type Customer = {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  order_count: number
  total_spend: number
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
      "support",
    ])

    const customers = await query<Customer>(
      `SELECT
         u.id,
         concat_ws(' ', u.first_name, u.last_name) AS name,
         u.email,
         u.phone,
         u.created_at,
         count(o.id)::int AS order_count,
         COALESCE(sum(o.total_kes), 0)::int AS total_spend
       FROM users u
       LEFT JOIN orders o
         ON o.customer_id = u.id
        AND o.status NOT IN ('cancelled', 'refunded')
       WHERE u.role = 'customer'
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    )

    return NextResponse.json({ customers: customers.rows })
  } catch (error) {
    return apiError(error)
  }
}
