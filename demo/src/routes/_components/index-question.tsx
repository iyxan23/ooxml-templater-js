export default function Question({
  question: title,
  answer: description,
}: {
  question: string;
  answer: string;
}) {
  return (
    <article className="rounded-md border border-foreground/10 bg-background p-4 w-[200px]">
      <h2 className="font-medium mb-2">{title}</h2>
      <p className="text-sm w-full text-muted-foreground">{description}</p>
    </article>
  );
}
