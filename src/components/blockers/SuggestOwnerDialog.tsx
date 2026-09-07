import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/context/LanguageContext";
import type { TeamMember } from "@/types";

interface SuggestOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemLabel: string;
  members: TeamMember[];
  saving?: boolean;
  onSubmit: (input: { memberId: string; reason: string }) => void;
}

/** Internal owner suggestion for a blocked item. Nothing is written to Azure DevOps. */
export const SuggestOwnerDialog = ({
  open,
  onOpenChange,
  itemLabel,
  members,
  saving = false,
  onSubmit,
}: SuggestOwnerDialogProps) => {
  const { t } = useLang();
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!memberId) return;
    onSubmit({ memberId, reason: reason.trim() });
    setMemberId("");
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t.blockersSuggestTitle}</DialogTitle>
          <DialogDescription>
            {t.blockersSuggestDescription.replace("{item}", itemLabel)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="suggest-member">{t.blockersSuggestMember}</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger id="suggest-member">
                <SelectValue placeholder={t.blockersSuggestMember} />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suggest-reason">{t.blockersSuggestReason}</Label>
            <Textarea
              id="suggest-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!memberId || saving}>
            {t.blockersSuggestSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
