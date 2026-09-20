import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { BLUETOOTH_WARNING } from "@/lib/printer-info-copy";

export const metadata: Metadata = {
  title: "Bluetooth printers | printkit",
  description:
    "How to print labels with a Bluetooth printer, why it needs a second device, and what to do instead.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mt-12 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {index + 1}
          </span>
          <div className="space-y-1">{item}</div>
        </li>
      ))}
    </ol>
  );
}

function Command({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted block rounded-md px-3 py-2 font-mono text-xs break-all">
      {children}
    </code>
  );
}

export default function BluetoothPrintersGuide() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="inline-block">
        <Wordmark />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Bluetooth printers
      </h1>

      <div className="border-border bg-muted/40 mt-6 rounded-lg border p-4">
        <p className="text-sm font-medium">Read this first</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {BLUETOOTH_WARNING}
        </p>
      </div>

      <p className="text-muted-foreground mt-6 text-sm leading-relaxed">
        This page is for vendors who already own a Bluetooth label printer and
        want to keep using it. Everything below is the extra work that printer
        needs. A printer that reaches printkit by itself needs none of it.
      </p>

      <Section id="why" title="Why a second device is needed">
        <p className="text-muted-foreground text-sm leading-relaxed">
          A Bluetooth printer has no internet connection of its own. It only
          listens to a device within about 10 metres of it.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          printkit runs on the internet, so something next to the printer has to
          carry each label the last few metres over Bluetooth. On an iPad that
          job is impossible: Apple does not let websites use Bluetooth.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          So a Bluetooth printer needs one of two helpers beside it, all day: an
          Android phone, or a Raspberry Pi.
        </p>
      </Section>

      <Section id="android" title="Using an Android phone">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Any Android phone on Android 10 or newer, with Chrome. It can be an
          old phone, as long as it stays plugged in.
        </p>
        <Steps
          items={[
            <p key="1" className="text-sm">
              Plug the phone in next to the printer and switch the printer on.
            </p>,
            <p key="2" className="text-sm">
              In the phone&apos;s settings, turn <b>Battery Saver off</b>. It
              stops Bluetooth working in the background, and printkit cannot
              override it.
            </p>,
            <p key="3" className="text-sm">
              Open printkit in Chrome on that phone and sign in.
            </p>,
            <p key="4" className="text-sm">
              Go to Printers, open your booth, and turn <b>Bridge mode</b> on.
            </p>,
            <p key="5" className="text-sm">
              Tap <b>Pair printer</b> and choose your printer from the list
              Chrome shows.
            </p>,
            <p key="6" className="text-sm">
              Tap <b>Print test</b>. A test label should come out.
            </p>,
            <p key="7" className="text-sm">
              Leave that screen open during service. printkit keeps the screen
              awake by itself.
            </p>,
          ]}
        />
      </Section>

      <Section id="pi" title="Using a Raspberry Pi">
        <p className="text-muted-foreground text-sm leading-relaxed">
          A Pi has no screen to leave on, so it suits a stall with no spare
          phone. It is more setup, and you need to be comfortable typing
          commands.
        </p>
        <p className="text-sm font-medium">What you need</p>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>A Raspberry Pi 4 or newer, with its power supply</li>
          <li>A microSD card, 16 GB or larger</li>
          <li>WiFi, or a phone hotspot at the stall</li>
        </ul>
        <Steps
          items={[
            <p key="1" className="text-sm">
              Flash Raspberry Pi OS Lite (64-bit) to the card with Raspberry Pi
              Imager, and set your WiFi and SSH login while flashing.
            </p>,
            <p key="2" className="text-sm">
              Start the Pi next to the printer and connect to it over SSH.
            </p>,
            <div key="3" className="space-y-2">
              <p className="text-sm">Install the printkit bridge:</p>
              <Command>
                curl -fsSLO
                https://github.com/cljiahao/Printkit/releases/latest/download/printkit-bridge.tar.gz
              </Command>
              <Command>
                tar -xzf printkit-bridge.tar.gz &amp;&amp; cd printkit-bridge
              </Command>
              <p className="text-muted-foreground text-sm">
                Read <code className="font-mono text-xs">install.sh</code>{" "}
                before you run it, then:
              </p>
              <Command>sudo ./install.sh</Command>
            </div>,
            <div key="4" className="space-y-2">
              <p className="text-sm">
                In printkit, open your booth, choose the Bluetooth printer and
                pick Raspberry Pi. It shows a pairing code. On the Pi:
              </p>
              <Command>printkit-bridge pair ABCD-2345</Command>
              <p className="text-muted-foreground text-sm">
                The code lasts 10 minutes and works once.
              </p>
            </div>,
            <div key="5" className="space-y-2">
              <p className="text-sm">Tell it which printer to use:</p>
              <Command>printkit-bridge use &quot;B1-XXXXXXXX&quot;</Command>
              <p className="text-muted-foreground text-sm">
                That name is the printer&apos;s Bluetooth name, printed on the
                device or shown in your phone&apos;s Bluetooth list.
              </p>
            </div>,
            <div key="6" className="space-y-2">
              <p className="text-sm">Start it, and check it is running:</p>
              <Command>sudo systemctl start printkit-bridge@$USER</Command>
              <Command>systemctl status printkit-bridge@$USER</Command>
            </div>,
          ]}
        />
      </Section>

      <Section id="faq" title="When something goes wrong">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium">
              The printer is not in the pairing list
            </dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              Switch the printer off and on, keep it within a couple of metres
              of the helper device, and make sure no other phone is already
              connected to it. A printer can only talk to one device at a time.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">
              Orders come in but nothing prints
            </dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              Check the Printers page. If the booth shows offline, the helper
              device has gone to sleep or lost the printer. On a phone, reopen
              Bridge mode. On a Pi, run the status command above.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Labels come out blank</dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              Thermal labels only print on one side. Reload the roll the other
              way round.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">
              A label printed but the order says it failed
            </dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              The confirmation did not get back to printkit in time. The label
              is fine. You can ignore it, or reprint from History.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">
              I want to move the printer to another booth
            </dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              Remove the printer from the old booth first, then set it up on the
              new one. Pairing it twice leaves the old booth waiting for a
              printer that is no longer there.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">I am giving the Pi away</dt>
            <dd className="text-muted-foreground mt-1 text-sm">
              Remove the printer in printkit. That cancels the Pi&apos;s access
              straight away, and the Pi stops asking for jobs.
            </dd>
          </div>
        </dl>
      </Section>

      <p className="text-muted-foreground mt-12 text-sm">
        Still stuck? Ask us from the help menu inside printkit.
      </p>
    </main>
  );
}
