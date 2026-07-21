export async function GET() {
  return new Response(JSON.stringify([]));
}

export async function POST() {
  return new Response(null, { status: 201 });
}
