import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { supportReplyInput } from "@/lib/validation";

const ADMIN_ROLES = ["super_admin", "manager", "support"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const { ticketId } = await params;
    const ticket = await query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.status, t.priority, t.created_at,
         u.first_name, u.last_name, u.email, u.phone, o.order_number
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.id = $1`,
      [ticketId],
    );
    if (!ticket.rows[0]) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    const messages = await query(
      `SELECT m.id, m.body, m.created_at, u.role AS author_role,
         concat(u.first_name, ' ', u.last_name) AS author_name
       FROM support_messages m JOIN users u ON u.id = m.author_id
       WHERE m.ticket_id = $1 ORDER BY m.created_at`,
      [ticketId],
    );
    return NextResponse.json({ ticket: ticket.rows[0], messages: messages.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const { ticketId } = await params;
    const { body } = supportReplyInput.parse(await request.json());
    const customer = await query<{ user_id: string; status: string }>(
      "SELECT user_id, status FROM support_tickets WHERE id = $1",
      [ticketId],
    );
    if (!customer.rows[0]) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    await transaction(async (client) => {
      await client.query("INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)", [ticketId, session.userId, body]);
      await client.query("UPDATE support_tickets SET status = 'answered', updated_at = now() WHERE id = $1", [ticketId]);
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'in_app', 'support-reply', $2)`,
        [customer.rows[0].user_id, JSON.stringify({ ticketId })],
      );
    });
    return NextResponse.json({ replied: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const { ticketId } = await params;
    const input = z
      .object({
        status: z.enum(["open", "answered", "closed"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      })
      .parse(await request.json());
    if (!Object.keys(input).length) return NextResponse.json({ error: "Nothing to update." }, { status: 422 });
    const updated = await query(
      `UPDATE support_tickets
       SET status = COALESCE($1, status), priority = COALESCE($2, priority), updated_at = now()
       WHERE id = $3 RETURNING id, status, priority`,
      [input.status ?? null, input.priority ?? null, ticketId],
    );
    if (!updated.rows[0]) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'support.ticket_updated', 'support_ticket', $2, $3)`,
      [session.userId, ticketId, JSON.stringify(input)],
    );
    return NextResponse.json({ ticket: updated.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
