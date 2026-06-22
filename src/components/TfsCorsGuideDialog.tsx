import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/context/LanguageContext";

interface TfsCorsGuideDialogProps {
  origin: string;
}

const CodeBlock = ({ code }: { code: string }) => {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t.copiedToClipboard);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted/60 border rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t.copyAria}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};

export const TfsCorsGuideDialog = ({ origin }: TfsCorsGuideDialogProps) => {
  const { t } = useLang();
  const iisWebConfig = `<!-- web.config at the root of the TFS site -->
<configuration>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <add name="Access-Control-Allow-Origin" value="${origin}" />
        <add name="Access-Control-Allow-Methods" value="GET, POST, PATCH, PUT, DELETE, OPTIONS" />
        <add name="Access-Control-Allow-Headers" value="Authorization, Content-Type, Accept, X-Requested-With" />
        <add name="Access-Control-Allow-Credentials" value="true" />
        <add name="Access-Control-Max-Age" value="86400" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>`;

  const nginxConf = `# nginx delante del TFS (snippet dentro del server { ... })
location / {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "${origin}" always;
        add_header Access-Control-Allow-Methods "GET, POST, PATCH, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Max-Age "86400" always;
        add_header Content-Length 0;
        add_header Content-Type "text/plain";
        return 204;
    }

    add_header Access-Control-Allow-Origin "${origin}" always;
    add_header Access-Control-Allow-Credentials "true" always;
    proxy_pass https://tfs-backend.internal;
}`;

  const apacheConf = `# Apache httpd.conf / .htaccess delante del TFS
<IfModule mod_headers.c>
    Header always set Access-Control-Allow-Origin "${origin}"
    Header always set Access-Control-Allow-Methods "GET, POST, PATCH, PUT, DELETE, OPTIONS"
    Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With"
    Header always set Access-Control-Allow-Credentials "true"
    Header always set Access-Control-Max-Age "86400"

    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} OPTIONS
    RewriteRule ^(.*)$ $1 [R=204,L]
</IfModule>`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          {t.corsViewGuide}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t.corsDialogTitle}
          </DialogTitle>
          <DialogDescription>
            {t.corsDialogDesc.split("<ORIGIN>")[0]}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{origin}</code>
            {t.corsDialogDesc.split("<ORIGIN>")[1]}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="iis" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="iis">IIS (web.config)</TabsTrigger>
            <TabsTrigger value="nginx">nginx</TabsTrigger>
            <TabsTrigger value="apache">Apache</TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[55vh] mt-3">
            <TabsContent value="iis" className="space-y-3 mt-0">
              <p className="text-sm text-muted-foreground">{t.corsIisExplain}</p>
              <CodeBlock code={iisWebConfig} />
              <p className="text-xs text-muted-foreground">{t.corsIisWarn}</p>
            </TabsContent>

            <TabsContent value="nginx" className="space-y-3 mt-0">
              <p className="text-sm text-muted-foreground">{t.corsNginxExplain}</p>
              <CodeBlock code={nginxConf} />
            </TabsContent>

            <TabsContent value="apache" className="space-y-3 mt-0">
              <p className="text-sm text-muted-foreground">{t.corsApacheExplain}</p>
              <CodeBlock code={apacheConf} />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="border-t pt-3 mt-2 space-y-1.5 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">{t.checkHowTo}</strong> {t.corsCheckIntro}
            {t.checkCorsDetails}{" "}
            <code className="bg-muted px-1 rounded">204</code> {t.corsCheckTail}{" "}
            <code className="bg-muted px-1 rounded">Access-Control-Allow-Origin</code>.
          </p>
          <p>
            <strong className="text-foreground">{t.corsSecurityLabel}</strong> {t.corsSecurityBody}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
