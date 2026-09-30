import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { supportTicketInput } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const result = await query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.status, t.priority, t.created_at, t.updated_at,
         (SELECT count(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
         (SELECT m.body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM support_tickets t WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 50`,
      [session.userId],
    );
    return NextResponse.json({ tickets: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const input = supportTicketInput.parse(await request.json());
    let orderId: string | null = null;
    if (input.orderNumber) {
      const order = await query<{ id: string }>(
        "SELECT id FROM orders WHERE order_number = $1 AND customer_id = $2",
        [input.orderNumber, session.userId],
      );
      orderId = order.rows[0]?.id ?? null;
    }
    const ticket = await transaction(async (client) => {
      const created = await client.query<{ id: string; ticket_number: string }>(
        `INSERT INTO support_tickets (ticket_number, user_id, order_id, subject, category)
         VALUES ('TCK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), $1, $2, $3, $4)
         RETURNING id, ticket_number`,
        [session.userId, orderId, input.subject, input.category],
      );
      await client.query(
        "INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)",
        [created.rows[0].id, session.userId, input.message],
      );
      return created.rows[0];
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
