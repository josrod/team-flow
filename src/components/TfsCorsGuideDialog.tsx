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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copiado al portapapeles");
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
        aria-label="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};

export const TfsCorsGuideDialog = ({ origin }: TfsCorsGuideDialogProps) => {
  const { t } = useLang();
  const iisWebConfig = `<!-- web.config en la raíz del sitio TFS -->
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
          Ver guía rápida de configuración
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Configurar CORS en el TFS
          </DialogTitle>
          <DialogDescription>
            El TFS debe responder con cabeceras CORS que permitan el origen{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{origin}</code>. Pide a tu
            equipo de IT que aplique uno de estos snippets en el reverse proxy o IIS que sirve el TFS.
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
              <p className="text-sm text-muted-foreground">
                TFS suele desplegarse sobre IIS. Edita el <code className="text-xs">web.config</code>{" "}
                del sitio (típicamente en <code className="text-xs">C:\inetpub\wwwroot\tfs\</code>) y
                añade el bloque siguiente. Reinicia el sitio en IIS Manager tras guardar.
              </p>
              <CodeBlock code={iisWebConfig} />
              <p className="text-xs text-muted-foreground">
                ⚠️ Si IIS también responde a las peticiones OPTIONS (preflight), asegúrate de que el
                handler <code>OPTIONSVerbHandler</code> esté habilitado y devuelva 200/204.
              </p>
            </TabsContent>

            <TabsContent value="nginx" className="space-y-3 mt-0">
              <p className="text-sm text-muted-foreground">
                Si delante del TFS hay un nginx (como reverse proxy), añade este bloque en el{" "}
                <code className="text-xs">server</code> que sirve el host del TFS y recarga con{" "}
                <code className="text-xs">nginx -s reload</code>.
              </p>
              <CodeBlock code={nginxConf} />
            </TabsContent>

            <TabsContent value="apache" className="space-y-3 mt-0">
              <p className="text-sm text-muted-foreground">
                Para Apache httpd como reverse proxy, asegúrate de tener{" "}
                <code className="text-xs">mod_headers</code> y <code className="text-xs">mod_rewrite</code>{" "}
                habilitados, y reinicia el servicio tras guardar.
              </p>
              <CodeBlock code={apacheConf} />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="border-t pt-3 mt-2 space-y-1.5 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Cómo verificar:</strong> abre DevTools → Network,
            pulsa <em>Probar conexión</em> y comprueba que la petición OPTIONS (preflight) recibe{" "}
            <code className="bg-muted px-1 rounded">204</code> con la cabecera{" "}
            <code className="bg-muted px-1 rounded">Access-Control-Allow-Origin</code>.
          </p>
          <p>
            <strong className="text-foreground">Seguridad:</strong> usa siempre un origen específico
            (no <code className="bg-muted px-1 rounded">*</code>) cuando envíes credenciales.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
