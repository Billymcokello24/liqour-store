import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { supportReplyInput } from "@/lib/validation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const session = await requireSession(request, ["customer"]);
    const { ticketId } = await params;
    const ticket = await query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.status, t.priority, t.created_at,
         o.order_number
       FROM support_tickets t LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.id = $1 AND t.user_id = $2`,
      [ticketId, session.userId],
    );
    if (!ticket.rows[0]) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    const messages = await query(
      `SELECT m.id, m.body, m.created_at, u.role AS author_role
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
    const session = await requireSession(request, ["customer"]);
    const { ticketId } = await params;
    const { body } = supportReplyInput.parse(await request.json());
    const ticket = await query<{ status: string }>(
      "SELECT status FROM support_tickets WHERE id = $1 AND user_id = $2",
      [ticketId, session.userId],
    );
    const found = ticket.rows[0];
    if (!found) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (found.status === "closed") {
      return NextResponse.json({ error: "This ticket is closed. Reopen it from the ticket list to reply." }, { status: 422 });
    }
    await query("INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)", [ticketId, session.userId, body]);
    await query(
      `UPDATE support_tickets SET status = 'customer_replied', updated_at = now() WHERE id = $1`,
      [ticketId],
    );
    return NextResponse.json({ replied: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const session = await requireSession(request, ["customer"]);
    const { ticketId } = await params;
    const action = z.object({ action: z.enum(["close", "reopen"]) }).parse(await request.json());
    const nextStatus = action.action === "close" ? "closed" : "open";
    const updated = await query(
      `UPDATE support_tickets SET status = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3 RETURNING id, status`,
      [nextStatus, ticketId, session.userId],
    );
    if (!updated.rows[0]) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    return NextResponse.json({ ticket: updated.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
