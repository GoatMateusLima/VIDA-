import { supabaseAdmin } from '../config/database';

export class AuditService {
  static async record(
    actorId: string | undefined,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {}
  ) {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata_json: metadata,
    });
    if (error) {
      console.error('[Audit] Falha ao registrar evento:', action, error.message);
    }
  }
}
