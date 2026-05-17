import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import SIP from "@/models/SIP";
import { auth } from "@/lib/auth";

/** GET — all SIPs for the current user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const sips = await SIP.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(sips);
}

/**
 * POST — create a SIP or append an installment.
 * Body (create): { fundName, ticker, monthlyAmount, startDate }
 * Body (installment): { _id, installment: { date, amountInvested, navAtPurchase } }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const body = await request.json();

  try {
    if (body._id && body.installment) {
      const sip = await SIP.findOne({
        _id: body._id,
        userId: session.user.id,
      });
      if (!sip) {
        return NextResponse.json(
          { error: "SIP not found" },
          { status: 404 }
        );
      }
      const { date, amountInvested, navAtPurchase } = body.installment;
      sip.installments.push({
        date: date ? new Date(date) : new Date(),
        amountInvested,
        navAtPurchase,
        unitsPurchased:
          navAtPurchase > 0 ? amountInvested / navAtPurchase : 0,
      });
      await sip.save();
      return NextResponse.json(sip);
    }

    const sip = await SIP.create({
      userId: session.user.id,
      fundName: body.fundName,
      ticker: body.ticker,
      monthlyAmount: body.monthlyAmount,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      isActive: body.isActive !== false,
    });
    return NextResponse.json(sip, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
