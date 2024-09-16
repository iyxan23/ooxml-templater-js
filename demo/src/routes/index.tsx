import { Button } from "~/components/ui/button";
import Question from "./_components/index-question";
import { Link } from "react-router-dom";
import { Logo } from "~/components/logo";

export function Component() {
  return (
    <main className="w-full h-full flex flex-col items-center gap-4 pt-[12.5vh] pb-16 relative">
      <p className="text-center absolute top-16 text-[10vw] md:text-[7vw] opacity-5 select-none">
        still wip ( ͡° ͜ʖ ͡°)
      </p>
      <Logo />
      <h1 className="font-mono text-3xl text-center">ooxml-templater-js</h1>
      <p className="text-center">
        no-nonsense{" "}
        <Button variant="link" asChild className="px-0">
          <a href="http://officeopenxml.com/">ooxml</a>
        </Button>{" "}
        file templater
      </p>

      <div className="h-16 w-[1px] bg-foreground/20 my-2">&nbsp;</div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <Question
          question="what?"
          answer="a ts-powered templater that is minimally invasive. have docx, xlsx? we gotcha (▀͡ ͜ʖ͡▀)"
        />
        <Question
          question="wtf 'minimally invasive'?"
          answer="i don't want to parse every xmls, this lib just modifies them (-｡-;"
        />
        <Question
          question="stable?"
          answer="the core is. this is a pretty new lib so you might wanna test it first ¯\_(ツ)_/¯"
        />
        <Question question="why?" answer="it's oss, duh ψ(｀∇ ´)ψ" />
      </section>

      <section className="mt-8 flex flex-row gap-4">
        <Button>
          <Link to="/docx">try docx</Link>
        </Button>
        <Button>
          <Link to="/xlsx">try xlsx</Link>
        </Button>
      </section>
    </main>
  );
}
