import { supabaseAdmin } from '../config/database';
import { AppError } from '../middlewares/errorMiddleware';

export class NotificationService {
  static async list(userId: string, page: number, limit: number) {
    const from = (page - 1) * limit;
    const { data, error, count } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) {
      throw new AppError('Erro ao buscar notificações.', 400);
    }
    return { items: data || [], page, limit, total: count || 0 };
  }

  static async markRead(userId: string, notificationId: string) {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ status: 'lida', read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) {
      throw new AppError('Erro ao atualizar notificação.', 400);
    }
    if (!data) {
      throw new AppError('Notificação não encontrada.', 404);
    }
    return data;
  }
}
