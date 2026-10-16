import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Imagem WebP 1x1 pixel válida (30 bytes) para garantir que as URLs de foto resolvam sem quebrar
const TINY_WEBP = Buffer.from(
  'UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAEAcQERGIiP4HAA==',
  'base64'
);

function ensureUploadsDirectory(): void {
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const sampleImages = [
    'seed-av-brasil-1.webp',
    'seed-av-brasil-2.webp',
    'seed-av-brasil-3.webp',
    'seed-av-brasil-contrib1.webp',
    'seed-rua-sao-bento.webp',
    'seed-coronel-inocencio.webp',
    'seed-marques-herval.webp',
    'seed-marques-herval-reopen.webp',
    'seed-av-saudade.webp',
  ];

  for (const imgName of sampleImages) {
    const fullPath = path.join(uploadsDir, imgName);
    if (!fs.existsSync(fullPath)) {
      try {
        fs.writeFileSync(fullPath, TINY_WEBP);
      } catch {
        // Ignora caso não tenha permissão no ambiente de teste
      }
    }
  }
}

export function seedDatabase(db: Database.Database): void {
  ensureUploadsDirectory();

  const now = Date.now();
  const dayMs = 86400000;

  const runSeedTx = db.transaction(() => {
    // Limpeza prévia para garantir atomicidade caso chamado manualmente
    db.prepare('DELETE FROM issue_timeline').run();
    db.prepare('DELETE FROM issue_contributions').run();
    db.prepare('DELETE FROM issue_votes').run();
    db.prepare('DELETE FROM issues').run();
    db.prepare('DELETE FROM blocked_devices').run();

    const insertIssue = db.prepare(`
      INSERT INTO issues (
        id, title, description, category, severity, auxiliary_data,
        raw_latitude, raw_longitude, latitude, longitude,
        street_name, street_group_key, neighborhood, reference_point,
        location_source, gps_accuracy_meters,
        photo_url, exif_captured_at, exif_latitude, exif_longitude,
        exif_distance_meters, exif_verified_local,
        author_name, device_hash, trust_score, moderation_status, is_shadowbanned,
        resolution_status, official_status, official_protocol_number,
        upvotes_count, consensus_score, reopened_count,
        created_at, updated_at
      ) VALUES (
        @id, @title, @description, @category, @severity, @auxiliary_data,
        @raw_latitude, @raw_longitude, @latitude, @longitude,
        @street_name, @street_group_key, @neighborhood, @reference_point,
        @location_source, @gps_accuracy_meters,
        @photo_url, @exif_captured_at, @exif_latitude, @exif_longitude,
        @exif_distance_meters, @exif_verified_local,
        @author_name, @device_hash, @trust_score, @moderation_status, @is_shadowbanned,
        @resolution_status, @official_status, @official_protocol_number,
        @upvotes_count, @consensus_score, @reopened_count,
        @created_at, @updated_at
      )
    `);

    const insertTimeline = db.prepare(`
      INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
      VALUES (@issue_id, @event_type, @title, @description, @created_at)
    `);

    const insertContribution = db.prepare(`
      INSERT INTO issue_contributions (
        issue_id, device_hash, author_name, note, photo_url,
        exif_captured_at, exif_verified_local, is_shadowbanned, created_at
      ) VALUES (
        @issue_id, @device_hash, @author_name, @note, @photo_url,
        @exif_captured_at, @exif_verified_local, @is_shadowbanned, @created_at
      )
    `);

    const insertVote = db.prepare(`
      INSERT INTO issue_votes (
        issue_id, device_hash, vote_type, voter_latitude, voter_longitude,
        distance_to_issue_meters, is_presential_gps, has_proof_photo,
        proof_photo_url, vote_weight, note, is_shadowbanned, created_at
      ) VALUES (
        @issue_id, @device_hash, @vote_type, @voter_latitude, @voter_longitude,
        @distance_to_issue_meters, @is_presential_gps, @has_proof_photo,
        @proof_photo_url, @vote_weight, @note, @is_shadowbanned, @created_at
      )
    `);

    // =========================================================================
    // 1. TAI-2026-0101 (Dossiê Av. Brasil - Ponto #1: 18 apoios, foto EXIF verificada)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0101',
      title: 'Cratera profunda na faixa da direita sentido Centro',
      description: 'Cratera de aproximadamente 1,2m de largura e 15cm de profundidade no asfalto da Av. Brasil, próximo ao nº 1420. Risco iminente de colisão e queda de motociclistas.',
      category: 'buracos_vias',
      severity: 5,
      auxiliary_data: null,
      raw_latitude: -23.10420,
      raw_longitude: -45.70980,
      latitude: -23.1042,
      longitude: -45.7098,
      street_name: 'Avenida Brasil',
      street_group_key: 'avenida-brasil::buracos_vias',
      neighborhood: 'Vera Cruz',
      reference_point: 'Próximo ao Supermercado Shibata e nº 1420',
      location_source: 'gps_live',
      gps_accuracy_meters: 6.5,
      photo_url: '/uploads/seed-av-brasil-1.webp',
      exif_captured_at: new Date(now - 3 * dayMs).toISOString(),
      exif_latitude: -23.10421,
      exif_longitude: -45.70982,
      exif_distance_meters: 2.4,
      exif_verified_local: 1,
      author_name: 'Marcos Silva (Morador)',
      device_hash: 'c0a80101e4f9b872d31e9876543210ab',
      trust_score: 95,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'received',
      official_protocol_number: null,
      upvotes_count: 18,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 3 * dayMs,
      updated_at: now - 1 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0101',
      event_type: 'created',
      title: 'Demanda registrada via GPS no local',
      description: 'Munícipe registrou o buraco com foto auditada por GPS.',
      created_at: now - 3 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0101',
      event_type: 'merged_support',
      title: 'Apoio e foto adicionados por comerciante vizinho',
      description: 'Morador a 15 metros confirmou a situação e anexou nova perspectiva do asfalto cedendo.',
      created_at: now - 2 * dayMs,
    });

    insertContribution.run({
      issue_id: 'TAI-2026-0101',
      device_hash: 'c0a80101_contrib_shibata_998811',
      author_name: 'Carlos Eduardo (Comerciante)',
      note: 'Passo aqui todo dia com van escolar, a cratera piora a cada chuva.',
      photo_url: '/uploads/seed-av-brasil-contrib1.webp',
      exif_captured_at: new Date(now - 2 * dayMs).toISOString(),
      exif_verified_local: 1,
      is_shadowbanned: 0,
      created_at: now - 2 * dayMs,
    });

    // =========================================================================
    // 2. TAI-2026-0102 (Dossiê Av. Brasil - Ponto #2: 16 apoios, afundamento)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0102',
      title: 'Afundamento de asfalto e boca de lobo desnivelada',
      description: 'Afundamento do leito carroçável na esquina da Av. Brasil com a Rua Rui Barbosa. Carros precisam desviar pela contramão em horário de pico.',
      category: 'buracos_vias',
      severity: 4,
      auxiliary_data: null,
      raw_latitude: -23.1018,
      raw_longitude: -45.7081,
      latitude: -23.1018,
      longitude: -45.7081,
      street_name: 'Avenida Brasil',
      street_group_key: 'avenida-brasil::buracos_vias',
      neighborhood: 'Jardim Caçapava',
      reference_point: 'Cruzamento com a Rua Rui Barbosa',
      location_source: 'gps_live',
      gps_accuracy_meters: 8.0,
      photo_url: '/uploads/seed-av-brasil-2.webp',
      exif_captured_at: new Date(now - 4 * dayMs).toISOString(),
      exif_latitude: -23.10179,
      exif_longitude: -45.70812,
      exif_distance_meters: 2.3,
      exif_verified_local: 1,
      author_name: 'Renata Oliveira',
      device_hash: 'c0a80102e4f9b872d31e9876543210ac',
      trust_score: 90,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'received',
      official_protocol_number: null,
      upvotes_count: 16,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 4 * dayMs,
      updated_at: now - 2 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0102',
      event_type: 'created',
      title: 'Demanda registrada',
      description: 'Munícipe registrou o afundamento do asfalto com foto.',
      created_at: now - 4 * dayMs,
    });

    // =========================================================================
    // 3. TAI-2026-0103 (Dossiê Av. Brasil - Ponto #3: 14 apoios, sequência buracos)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0103',
      title: 'Sequência de buracos na sarjeta e poça permanente',
      description: 'Série de três buracos junto à guia que acumulam água de chuva na Av. Brasil, altura do nº 450. Veículos espirram água nos pedestres que aguardam ônibus.',
      category: 'buracos_vias',
      severity: 3,
      auxiliary_data: null,
      raw_latitude: -23.0989,
      raw_longitude: -45.7062,
      latitude: -23.0989,
      longitude: -45.7062,
      street_name: 'Avenida Brasil',
      street_group_key: 'avenida-brasil::buracos_vias',
      neighborhood: 'Centro / Vila São João',
      reference_point: 'Em frente ao ponto de ônibus da Vila São João / altura do nº 450',
      location_source: 'photo_exif',
      gps_accuracy_meters: 10.0,
      photo_url: '/uploads/seed-av-brasil-3.webp',
      exif_captured_at: new Date(now - 5 * dayMs).toISOString(),
      exif_latitude: -23.09888,
      exif_longitude: -45.70623,
      exif_distance_meters: 3.8,
      exif_verified_local: 1,
      author_name: 'Anônimo',
      device_hash: 'c0a80103e4f9b872d31e9876543210ad',
      trust_score: 85,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'received',
      official_protocol_number: null,
      upvotes_count: 14,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 5 * dayMs,
      updated_at: now - 3 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0103',
      event_type: 'created',
      title: 'Demanda registrada',
      description: 'Munícipe registrou poça e desníveis na sarjeta.',
      created_at: now - 5 * dayMs,
    });

    // =========================================================================
    // 4. TAI-2026-0104 (Iluminação na Vila Resende - Protocolada na Câmara)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0104',
      title: 'Poste com luminária queimada em frente à praça da Vila Resende',
      description: 'Luminária de vapor de sódio totalmente apagada há mais de duas semanas na Rua São Bento, gerando escuridão e sensação de insegurança para quem caminha pela praça à noite.',
      category: 'iluminacao',
      severity: 4,
      auxiliary_data: JSON.stringify({
        pole_number: 'CP-4812',
        approximate_time: 'Noturno (desde 01/10)',
      }),
      raw_latitude: -23.1075,
      raw_longitude: -45.7142,
      latitude: -23.1075,
      longitude: -45.7142,
      street_name: 'Rua São Bento',
      street_group_key: 'rua-sao-bento::iluminacao',
      neighborhood: 'Vila Resende',
      reference_point: 'Praça da Vila Resende, em frente ao nº 215',
      location_source: 'gps_live',
      gps_accuracy_meters: 5.0,
      photo_url: '/uploads/seed-rua-sao-bento.webp',
      exif_captured_at: new Date(now - 6 * dayMs).toISOString(),
      exif_latitude: -23.1075,
      exif_longitude: -45.7142,
      exif_distance_meters: 0.0,
      exif_verified_local: 1,
      author_name: 'Cláudio Henrique',
      device_hash: 'c0a80104e4f9b872d31e9876543210ae',
      trust_score: 95,
      moderation_status: 'approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'protocolled',
      official_protocol_number: 'Indicação Nº 142/2026 - Câmara Municipal de Caçapava',
      upvotes_count: 9,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 6 * dayMs,
      updated_at: now - 2 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0104',
      event_type: 'created',
      title: 'Demanda registrada',
      description: 'Morador apontou lâmpada queimada no poste CP-4812.',
      created_at: now - 6 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0104',
      event_type: 'official_protocol',
      title: 'Encaminhado ao Poder Legislativo de Caçapava',
      description: 'Protocolado sob Indicação Nº 142/2026 - Câmara Municipal de Caçapava.',
      created_at: now - 2 * dayMs,
    });

    // =========================================================================
    // 5. TAI-2026-0105 (Sinalização no Centro - Faixa e Semáforo Gravidade 5/5)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0105',
      title: 'Faixa de pedestres apagada e semáforo intermitente no Centro',
      description: 'Pintura da faixa de travessia de pedestres totalmente desgastada e foco de pedestres do semáforo piscando em amarelo no cruzamento central. Alto risco de atropelamento de estudantes.',
      category: 'sinalizacao_transito',
      severity: 5,
      auxiliary_data: JSON.stringify({
        sign_type: 'Sinalização Semafórica e Faixa de Travessia',
      }),
      raw_latitude: -23.1004,
      raw_longitude: -45.7059,
      latitude: -23.1004,
      longitude: -45.7059,
      street_name: 'Av. Coronel Manoel Inocêncio',
      street_group_key: 'avenida-coronel-manoel-inocencio::sinalizacao_transito',
      neighborhood: 'Centro',
      reference_point: 'Esquina com a Rua Prudente de Moraes, próximo aos bancos',
      location_source: 'gps_live',
      gps_accuracy_meters: 6.0,
      photo_url: '/uploads/seed-coronel-inocencio.webp',
      exif_captured_at: new Date(now - 2 * dayMs).toISOString(),
      exif_latitude: -23.10038,
      exif_longitude: -45.70592,
      exif_distance_meters: 3.1,
      exif_verified_local: 1,
      author_name: 'Professora Luciana',
      device_hash: 'c0a80105e4f9b872d31e9876543210af',
      trust_score: 100,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'triaged',
      official_protocol_number: null,
      upvotes_count: 27,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 2 * dayMs,
      updated_at: now - 1 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0105',
      event_type: 'created',
      title: 'Demanda registrada com urgência',
      description: 'Registro de risco iminente de atropelamento na travessia central.',
      created_at: now - 2 * dayMs,
    });

    // =========================================================================
    // 6. TAI-2026-0106 (Saúde na Vila Paraíso - Foto Opcional / null)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0106',
      title: 'Falta de fitas de glicemia e demora no acolhimento na UBS',
      description: 'Munícipes aguardando há mais de duas horas por triagem e falta de tiras para teste de glicemia capilar na unidade básica de saúde da Vila Paraíso.',
      category: 'saude',
      severity: 4,
      auxiliary_data: JSON.stringify({
        health_unit: 'UBS / ESF Vila Paraíso',
        affected_service: 'Triagem e Insumos Diabéticos',
      }),
      raw_latitude: -23.0945,
      raw_longitude: -45.7015,
      latitude: -23.0945,
      longitude: -45.7015,
      street_name: 'Rua Dr. José de Moura Resende',
      street_group_key: 'rua-doutor-jose-de-moura-resende::saude',
      neighborhood: 'Vila Paraíso',
      reference_point: 'Estratégia Saúde da Família (ESF) Vila Paraíso',
      location_source: 'search_address',
      gps_accuracy_meters: null,
      photo_url: null,
      exif_captured_at: null,
      exif_latitude: null,
      exif_longitude: null,
      exif_distance_meters: null,
      exif_verified_local: 0,
      author_name: 'Dona Aparecida',
      device_hash: 'c0a80106e4f9b872d31e9876543210b0',
      trust_score: 70,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'open',
      official_status: 'received',
      official_protocol_number: null,
      upvotes_count: 21,
      consensus_score: 0.0,
      reopened_count: 0,
      created_at: now - 3 * dayMs,
      updated_at: now - 1 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0106',
      event_type: 'created',
      title: 'Demanda de Saúde Pública registrada',
      description: 'Munícipe registrou relato detalhado da falta de insumos na UBS Vila Paraíso.',
      created_at: now - 3 * dayMs,
    });

    // =========================================================================
    // 7. TAI-2026-0107 (Caso REABERTO - 4 eventos na timeline, votos negativos)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0107',
      title: 'Buraco reaberto após chuva forte no Centro (Tapa-buraco cedeu)',
      description: 'O asfalto cedeu novamente no mesmo ponto que havia recebido reparo paliativo de tapa-buraco. O remendo soltou com a chuva e as pedras soltas estão quebrando para-brisas.',
      category: 'buracos_vias',
      severity: 4,
      auxiliary_data: null,
      raw_latitude: -23.0996,
      raw_longitude: -45.7088,
      latitude: -23.0996,
      longitude: -45.7088,
      street_name: 'Rua Marquês de Herval',
      street_group_key: 'rua-marques-de-herval::buracos_vias',
      neighborhood: 'Centro',
      reference_point: 'Em frente ao Colégio / nº 310',
      location_source: 'gps_live',
      gps_accuracy_meters: 6.0,
      photo_url: '/uploads/seed-marques-herval.webp',
      exif_captured_at: new Date(now - 1 * dayMs).toISOString(),
      exif_latitude: -23.09958,
      exif_longitude: -45.70881,
      exif_distance_meters: 2.4,
      exif_verified_local: 1,
      author_name: 'Felipe Guimarães',
      device_hash: 'c0a80107e4f9b872d31e9876543210b1',
      trust_score: 95,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'reopened',
      official_status: 'received',
      official_protocol_number: null,
      upvotes_count: 12,
      consensus_score: -3.8,
      reopened_count: 1,
      created_at: now - 8 * dayMs,
      updated_at: now - 12 * 3600000,
    });

    // 4 eventos auditáveis na timeline (Requisito estrito)
    insertTimeline.run({
      issue_id: 'TAI-2026-0107',
      event_type: 'created',
      title: 'Demanda registrada por morador',
      description: 'Relato inicial de buraco no asfalto da Rua Marquês de Herval.',
      created_at: now - 8 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0107',
      event_type: 'waze_verifying',
      title: 'Entrou em verificação comunitária',
      description: 'Moradores no local indicaram início de reparo pela equipe de tapa-buraco.',
      created_at: now - 5 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0107',
      event_type: 'waze_resolved',
      title: 'Marcado como resolvido provisoriamente por moradores',
      description: 'Votação presencial atingiu consenso positivo de que a via havia sido consertada.',
      created_at: now - 4 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0107',
      event_type: 'waze_reopened',
      title: 'Problema recorrente: Reaberto pela comunidade!',
      description: 'Moradores presenciais atestaram que o asfalto cedeu novamente após chuva forte (-11.0 pontos em 48h). Chamado reaberto automaticamente!',
      created_at: now - 1 * dayMs,
    });

    // Votos que levaram à resolução e posterior reabertura
    insertVote.run({
      issue_id: 'TAI-2026-0107',
      device_hash: 'vote_dev_0107_a_res',
      vote_type: 'resolved_yes',
      voter_latitude: -23.09958,
      voter_longitude: -45.70881,
      distance_to_issue_meters: 2.4,
      is_presential_gps: 1,
      has_proof_photo: 1,
      proof_photo_url: '/uploads/seed-marques-herval.webp',
      vote_weight: 5.0,
      note: 'Jogaram massa asfáltica agora à tarde.',
      is_shadowbanned: 0,
      created_at: now - 4 * dayMs,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0107',
      device_hash: 'vote_dev_0107_b_res',
      vote_type: 'resolved_yes',
      voter_latitude: -23.09965,
      voter_longitude: -45.70875,
      distance_to_issue_meters: 10.2,
      is_presential_gps: 1,
      has_proof_photo: 1,
      proof_photo_url: '/uploads/seed-marques-herval.webp',
      vote_weight: 5.0,
      note: 'Confirmado, fecharam o buraco.',
      is_shadowbanned: 0,
      created_at: now - 4 * dayMs,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0107',
      device_hash: 'vote_dev_0107_c_reopen',
      vote_type: 'resolved_no_returned',
      voter_latitude: -23.09960,
      voter_longitude: -45.70882,
      distance_to_issue_meters: 3.0,
      is_presential_gps: 1,
      has_proof_photo: 1,
      proof_photo_url: '/uploads/seed-marques-herval-reopen.webp',
      vote_weight: 5.0,
      note: 'O asfalto soltou todo com a chuva, está pior que antes!',
      is_shadowbanned: 0,
      created_at: now - 1 * dayMs,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0107',
      device_hash: 'vote_dev_0107_d_reopen',
      vote_type: 'resolved_no_returned',
      voter_latitude: -23.09970,
      voter_longitude: -45.70890,
      distance_to_issue_meters: 15.0,
      is_presential_gps: 1,
      has_proof_photo: 0,
      proof_photo_url: null,
      vote_weight: 3.0,
      note: 'Passei agora e a cratera voltou inteira.',
      is_shadowbanned: 0,
      created_at: now - 1 * dayMs + 3600000,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0107',
      device_hash: 'vote_dev_0107_e_reopen',
      vote_type: 'resolved_no_returned',
      voter_latitude: -23.09955,
      voter_longitude: -45.70878,
      distance_to_issue_meters: 8.5,
      is_presential_gps: 1,
      has_proof_photo: 0,
      proof_photo_url: null,
      vote_weight: 3.0,
      note: 'Tapa-buraco de péssima qualidade, abriu de novo.',
      is_shadowbanned: 0,
      created_at: now - 18 * 3600000,
    });

    // =========================================================================
    // 8. TAI-2026-0108 (Caso em VERIFICAÇÃO COMUNITÁRIA - S = 6.0)
    // =========================================================================
    insertIssue.run({
      id: 'TAI-2026-0108',
      title: 'Rampa de acessibilidade refeita aguardando validação dos moradores',
      description: 'Guia rebaixada e rampa para cadeirantes na Av. da Saudade foi reformada pela Prefeitura. O chamado está em fase de verificação comunitária pelos pedestres locais.',
      category: 'calcadas_acessibilidade',
      severity: 3,
      auxiliary_data: JSON.stringify({
        accessibility_type: 'Rampa de Acesso e Guia Rebaixada',
      }),
      raw_latitude: -23.1128,
      raw_longitude: -45.6945,
      latitude: -23.1128,
      longitude: -45.6945,
      street_name: 'Av. da Saudade',
      street_group_key: 'avenida-da-saudade::calcadas_acessibilidade',
      neighborhood: 'Parque Residencial Nova Caçapava',
      reference_point: 'Próximo à rotatória de entrada do Nova Caçapava',
      location_source: 'gps_live',
      gps_accuracy_meters: 6.0,
      photo_url: '/uploads/seed-av-saudade.webp',
      exif_captured_at: new Date(now - 1 * dayMs).toISOString(),
      exif_latitude: -23.1128,
      exif_longitude: -45.6945,
      exif_distance_meters: 0.0,
      exif_verified_local: 1,
      author_name: 'Gabriel Santos',
      device_hash: 'c0a80108e4f9b872d31e9876543210b2',
      trust_score: 90,
      moderation_status: 'auto_approved',
      is_shadowbanned: 0,
      resolution_status: 'verifying_resolution',
      official_status: 'completed',
      official_protocol_number: null,
      upvotes_count: 11,
      consensus_score: 6.0,
      reopened_count: 0,
      created_at: now - 5 * dayMs,
      updated_at: now - 1 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0108',
      event_type: 'created',
      title: 'Demanda de acessibilidade registrada',
      description: 'Rampa de cadeirante danificada reportada por morador.',
      created_at: now - 5 * dayMs,
    });

    insertTimeline.run({
      issue_id: 'TAI-2026-0108',
      event_type: 'waze_verifying',
      title: 'Em verificação comunitária (Saldo: 6.0)',
      description: 'Dois munícipes presencialmente no local validaram que a obra foi realizada.',
      created_at: now - 1 * dayMs,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0108',
      device_hash: 'vote_dev_0108_a_pres',
      vote_type: 'resolved_yes',
      voter_latitude: -23.11282,
      voter_longitude: -45.69451,
      distance_to_issue_meters: 2.5,
      is_presential_gps: 1,
      has_proof_photo: 0,
      proof_photo_url: null,
      vote_weight: 3.0,
      note: 'Passei agora e a guia foi concretada.',
      is_shadowbanned: 0,
      created_at: now - 1 * dayMs,
    });

    insertVote.run({
      issue_id: 'TAI-2026-0108',
      device_hash: 'vote_dev_0108_b_pres',
      vote_type: 'resolved_yes',
      voter_latitude: -23.11279,
      voter_longitude: -45.69448,
      distance_to_issue_meters: 3.0,
      is_presential_gps: 1,
      has_proof_photo: 0,
      proof_photo_url: null,
      vote_weight: 3.0,
      note: 'Ficou bom o nivelamento.',
      is_shadowbanned: 0,
      created_at: now - 20 * 3600000,
    });
  });

  runSeedTx();
}

// Execução direta via CLI (ex: `npx tsx src/server/db/seed.ts`)
if (process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))) {
  (async () => {
    try {
      const { getDb } = await import('./index.js').catch(() => import('./index'));
      const database = getDb();
      seedDatabase(database);
      console.log('✅ Seed de Caçapava populado com sucesso (8 demandas realistas).');
    } catch (err) {
      console.error('Erro ao executar seed:', err);
      process.exit(1);
    }
  })();
}
