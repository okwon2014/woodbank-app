-- ============================================================
-- 004_seed.sql
-- 수종·행정구역 시드 데이터 (필요 시 자유롭게 추가)
-- ============================================================

-- ----- 수종 -----
insert into species(code, ko_name, sci_name, family) values
  ('CES', '팽나무',        'Celtis sinensis Pers.',            'Cannabaceae'),
  ('QAC', '상수리나무',    'Quercus acutissima Carruth.',      'Fagaceae'),
  ('QAL', '갈참나무',      'Quercus aliena Blume',             'Fagaceae'),
  ('QSE', '졸참나무',      'Quercus serrata Murray',           'Fagaceae'),
  ('QVA', '굴참나무',      'Quercus variabilis Blume',         'Fagaceae'),
  ('QMO', '신갈나무',      'Quercus mongolica Fisch. ex Ledeb.','Fagaceae'),
  ('CHO', '편백',          'Chamaecyparis obtusa (Siebold &Zucc.) Endl.', 'Cupressaceae'),
  ('CJA', '삼나무',        'Cryptomeria japonica D.Don',       'Cupressaceae'),
  ('PDE', '소나무',        'Pinus densiflora Siebold &Zucc.',  'Pinaceae'),
  ('PRI', '리기테다소나무', 'Pinus rigida x P. taeda',          'Pinaceae'),
  ('CAR', '서어나무',      'Carpinus laxiflora Blume',         'Betulaceae'),
  ('RPS', '아까시나무',    'Robinia pseudoacacia L.',          'Fabaceae'),
  ('POA', '은사시(현사시)나무','Populus alba x P. davidiana',   'Salicaceae'),
  ('GIN', '은행나무',      'Ginkgo biloba L.',                 'Ginkgoaceae'),
  ('ZSE', '느티나무',      'Zelkova serrata (Thunb.) Makino',  'Ulmaceae')
on conflict (code) do nothing;

-- ----- 행정구역 (예시: 전라남도 일부 + 서울 + 경기 일부) -----
insert into regions(sido_code, sigungu_code, sido_name, sigungu_name) values
  ('46', '46710', '전라남도', '담양군'),
  ('46', '46720', '전라남도', '곡성군'),
  ('46', '46770', '전라남도', '장흥군'),
  ('46', '46780', '전라남도', '강진군'),
  ('46', '46790', '전라남도', '해남군'),
  ('11', '11680', '서울특별시', '강남구'),
  ('11', '11620', '서울특별시', '관악구'),
  ('41', '41117', '경기도', '수원시 영통구'),
  ('41', '41210', '경기도', '광명시'),
  ('51', '51110', '강원도', '춘천시')
on conflict (sido_code, sigungu_code) do nothing;
