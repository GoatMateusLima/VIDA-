/**
 * VIDA+ - UserController (Camada de Controle - Usuários e Autenticação)
 *
 * Responsabilidade do Controller:
 *   - Receber a requisição HTTP do Express
 *   - Validar o formato dos dados de entrada usando Zod (retorna 400 se inválido)
 *   - Chamar o método correto do UserService (que contém a lógica de negócio)
 *   - Formatar e retornar a resposta JSON com o status HTTP adequado
 *   - Passar erros para o errorMiddleware via next(error)
 *
 * O controller NÃO contém lógica de negócio — essa responsabilidade é do Service.
 * O controller NÃO acessa o banco de dados diretamente — essa é a função do Service.
 *
 * Métodos disponíveis:
 *   register          → POST /api/auth/register
 *   login             → POST /api/auth/login
 *   logout            → POST /api/auth/logout
 *   me                → GET  /api/users/me
 *   updatePreferences → PATCH /api/users/me/preferences
 *   acceptConsent     → POST /api/users/me/consent
 */

import { Response, NextFunction } from "express";
import { z } from "zod";
import { UserService } from "../services/UserService";
import { AuthenticatedRequest } from "../types";
import { hashPrivateValue } from "../utils/helpers";

export class UserController {
  static async listUsers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await UserService.listUsers();
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  static async updateRole(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const body = z
        .object({
          role: z.enum([
            "cadastrado",
            "voluntario",
            "moderador",
            "administrador",
          ]),
        })
        .parse(req.body);
      const data = await UserService.updateRole(req.params.id, body.role);
      res
        .status(200)
        .json({
          status: "success",
          message: "Papel atualizado com sucesso.",
          data,
        });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cadastra um novo usuário na plataforma.
   * Cria a conta no Supabase Auth e, via trigger, nas tabelas públicas.
   *
   * Body esperado: { email, password, displayName, role? }
   * Resposta: 201 com dados do usuário criado
   */
  static async register(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      // Valida os dados de entrada com Zod antes de qualquer processamento
      const schema = z.object({
        email: z.string().email("E-mail inválido"),
        password: z
          .string()
          .min(10, "A senha precisa de pelo menos 10 caracteres")
          .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
          .regex(/[A-Z]/, "A senha precisa de uma letra maiúscula")
          .regex(/[0-9]/, "A senha precisa de um número"),
        displayName: z.string().trim().min(2, "Nome muito curto").max(100),
      });

      const body = schema.parse(req.body);
      const data = await UserService.register(
        body.email,
        body.password,
        body.displayName,
      );

      res.status(201).json({
        status: "success",
        message: "Usuário cadastrado com sucesso!",
        data: {
          user: data.user,
          session: data.session,
        },
      });
    } catch (error) {
      next(error); // Repassa para o errorMiddleware tratar e formatar
    }
  }

  static async requestPasswordReset(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      await UserService.requestPasswordReset(body.email);
      res.status(200).json({
        status: "success",
        message:
          "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.",
      });
    } catch (error) {
      next(error);
    }
  }

  static async updatePassword(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const token = req.headers.authorization?.split(" ")[1] || "";
      const body = z
        .object({
          password: z
            .string()
            .min(10)
            .regex(/[a-z]/)
            .regex(/[A-Z]/)
            .regex(/[0-9]/),
        })
        .parse(req.body);
      await UserService.updatePassword(token, body.password);
      res
        .status(200)
        .json({ status: "success", message: "Senha atualizada com sucesso." });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Autentica o usuário e retorna a sessão com access_token e refresh_token.
   * O frontend deve armazenar o access_token para enviar nas próximas requisições.
   *
   * Body esperado: { email, password }
   * Resposta: 200 com session (tokens) e dados do usuário
   */
  static async login(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const schema = z.object({
        email: z.string().email("E-mail inválido"),
        password: z.string().min(1, "Senha é obrigatória"),
      });

      const body = schema.parse(req.body);
      const data = await UserService.login(body.email, body.password);

      res.status(200).json({
        status: "success",
        message: "Autenticação realizada com sucesso!",
        data: { session: data.session, user: data.user },
      });
    } catch (error) {
      next(error);
    }
  }

  static async anonymous(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await UserService.signInAnonymously();
      res.status(201).json({
        status: "success",
        message: "Sessão pseudônima criada.",
        data: { session: data.session, user: data.user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Encerra a sessão do usuário, invalidando o token no Supabase.
   * O token é extraído do header Authorization da requisição.
   *
   * Resposta: 200 confirmando o logout
   */
  static async logout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader ? authHeader.split(" ")[1] : "";
      await UserService.logout(token);

      res.status(200).json({
        status: "success",
        message: "Logout realizado com sucesso!",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retorna os dados completos do usuário autenticado (perfil + preferências).
   * O ID do usuário é extraído de req.user (injetado pelo authMiddleware).
   *
   * Resposta: 200 com dados de public.users + public.user_profiles
   */
  static async me(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }
      const data = await UserService.getProfile(req.user.id);
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualiza as preferências e dados do perfil do usuário logado.
   * Somente os campos enviados no body serão modificados (PATCH parcial).
   *
   * Body esperado: { nickname?, birth_year?, state?, preferences_json? }
   * Resposta: 200 com perfil atualizado
   */
  static async updatePreferences(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z
        .object({
          nickname: z.string().trim().min(2).max(50).optional(),
          birth_year: z
            .number()
            .int()
            .min(1900)
            .max(new Date().getFullYear() - 13)
            .optional(),
          state: z
            .string()
            .trim()
            .length(2)
            .transform((value) => value.toUpperCase())
            .optional(),
          preferences_json: z.record(z.unknown()).optional(),
        })
        .strict();

      const body = schema.parse(req.body);
      const data = await UserService.updateProfile(req.user.id, body);

      res.status(200).json({
        status: "success",
        message: "Preferências atualizadas com sucesso!",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Registra o aceite explícito de um documento de consentimento (LGPD).
   * Cria um registro imutável com tipo, versão e data do aceite.
   *
   * Body esperado: { type, version }
   *   type: 'termos_de_uso' | 'politica_privacidade' | etc.
   *   version: '1.0' | '2.1' | etc.
   * Resposta: 200 com registro de consentimento criado
   */
  static async acceptConsent(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z.object({
        type: z.enum(["termos_de_uso", "politica_privacidade", "comunicacoes"]),
        version: z
          .string()
          .trim()
          .regex(/^\d+\.\d+(\.\d+)?$/, "Versão inválida"),
      });

      const body = schema.parse(req.body);
      const ipHash = req.ip ? hashPrivateValue(req.ip) : undefined;
      const data = await UserService.registerConsent(
        req.user.id,
        body.type,
        body.version,
        ipHash,
      );

      res.status(200).json({
        status: "success",
        message: "Consentimento registrado!",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
