// Goi "Quan ly giao dien": menu portal, khoi chuyen muc trang chu,
// hot link, cai dat header/footer/favicon.
// categoryId/articleId luu dang chuoi (khong FK): service tu tra cuu
// ten/slug luc doc, giong khuon print-articles (tranh P1012).
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function isHttpUrl(v: string) {
  return /^https?:\/\/.+/i.test(v);
}

// Anh luu dang duong dan tuong doi (/images/...) hoac URL http(s).
function isImageRef(v: string) {
  return v.startsWith('/') || isHttpUrl(v);
}

@Injectable()
export class SiteInterfaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Tra cuu chung ----------
  private async findCategory(ref: string) {
    return this.prisma.newsCategory.findFirst({
      where: { OR: [{ id: ref }, { publicId: ref }] },
    });
  }

  private async findArticle(ref: string) {
    return this.prisma.newsArticle.findFirst({
      where: { OR: [{ id: ref }, { publicId: ref }] },
    });
  }

  // Danh sach chuyen muc cho picker cua CMS (ca muc an, kem co isVisible
  // de CMS danh dau; muc an van chon duoc nhung khong hien cong khai).
  async pickerCategories() {
    const rows = await this.prisma.newsCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      name: r.name,
      slug: r.slug,
      parentId: r.parentId,
      parentName: r.parentId ? byId.get(r.parentId)?.name || null : null,
      isVisible: r.isVisible,
    }));
  }

  // Tim bai viet cho picker hot link (tim theo tieu de, moi trang thai).
  async pickerArticles(q: string) {
    const rows = await this.prisma.newsArticle.findMany({
      where: q ? { title: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, publicId: true, title: true, slug: true, status: true },
    });
    return rows;
  }

  // ---------- Menu ----------
  async listMenu() {
    const rows = await this.prisma.navMenuItem.findMany({ orderBy: { sortOrder: 'asc' } });
    const out: any[] = [];
    for (const r of rows) {
      const cat = await this.findCategory(r.categoryId);
      if (!cat) continue;
      out.push({ id: r.id, categoryId: cat.id, name: cat.name, slug: cat.slug, isVisible: cat.isVisible, sortOrder: r.sortOrder });
    }
    return out;
  }

  async addMenu(categoryId: string) {
    const cat = await this.findCategory(categoryId);
    if (!cat) throw new BadRequestException('chuyen muc khong ton tai');
    const dup = await this.prisma.navMenuItem.findUnique({ where: { categoryId: cat.id } });
    if (dup) throw new ConflictException('chuyen muc da co trong menu');
    const max = await this.prisma.navMenuItem.aggregate({ _max: { sortOrder: true } });
    return this.prisma.navMenuItem.create({
      data: { categoryId: cat.id, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  async removeMenu(id: string) {
    const row = await this.prisma.navMenuItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('muc menu khong ton tai');
    await this.prisma.navMenuItem.delete({ where: { id } });
    return { ok: true };
  }

  async reorderMenu(ids: string[]) {
    await this.reorder(this.prisma.navMenuItem, ids);
    return { ok: true };
  }

  // ---------- Khoi chuyen muc trang chu ----------
  async listHomeSections() {
    const rows = await this.prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    const all = await this.prisma.newsCategory.findMany({ select: { id: true, name: true } });
    const byId = new Map(all.map((c) => [c.id, c.name]));
    const out: any[] = [];
    for (const r of rows) {
      const cat = await this.findCategory(r.categoryId);
      if (!cat) continue;
      out.push({ id: r.id, categoryId: cat.id, name: cat.name, slug: cat.slug, parentName: cat.parentId ? byId.get(cat.parentId) || null : null, isVisible: cat.isVisible, sortOrder: r.sortOrder });
    }
    return out;
  }

  async addHomeSection(categoryId: string) {
    const cat = await this.findCategory(categoryId);
    if (!cat) throw new BadRequestException('chuyen muc khong ton tai');
    const dup = await this.prisma.homeSection.findUnique({ where: { categoryId: cat.id } });
    if (dup) throw new ConflictException('chuyen muc da co trong trang chu');
    const max = await this.prisma.homeSection.aggregate({ _max: { sortOrder: true } });
    return this.prisma.homeSection.create({
      data: { categoryId: cat.id, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  async removeHomeSection(id: string) {
    const row = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('khoi trang chu khong ton tai');
    await this.prisma.homeSection.delete({ where: { id } });
    return { ok: true };
  }

  async reorderHomeSections(ids: string[]) {
    await this.reorder(this.prisma.homeSection, ids);
    return { ok: true };
  }

  // ---------- Hot link ----------
  async listHotLinks() {
    const rows = await this.prisma.hotLink.findMany({ orderBy: { sortOrder: 'asc' } });
    const out: any[] = [];
    for (const r of rows) {
      const art = await this.findArticle(r.articleId);
      if (!art) continue;
      out.push({ id: r.id, articleId: art.publicId, title: art.title, slug: art.slug, status: art.status, sortOrder: r.sortOrder });
    }
    return out;
  }

  async addHotLink(articleId: string) {
    const art = await this.findArticle(articleId);
    if (!art) throw new BadRequestException('bai viet khong ton tai');
    const dup = await this.prisma.hotLink.findUnique({ where: { articleId: art.publicId } });
    if (dup) throw new ConflictException('bai viet da co trong hot link');
    const max = await this.prisma.hotLink.aggregate({ _max: { sortOrder: true } });
    return this.prisma.hotLink.create({
      data: { articleId: art.publicId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  async removeHotLink(id: string) {
    const row = await this.prisma.hotLink.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('hot link khong ton tai');
    await this.prisma.hotLink.delete({ where: { id } });
    return { ok: true };
  }

  async reorderHotLinks(ids: string[]) {
    await this.reorder(this.prisma.hotLink, ids);
    return { ok: true };
  }

  // Sap xep lai: ids phai khop dung tap hien co (khong thua, khong thieu).
  private async reorder(delegate: any, ids: string[]) {
    const rows = await delegate.findMany({ select: { id: true } });
    const current = new Set(rows.map((r: any) => r.id));
    if (ids.length !== current.size || ids.some((id: string) => !current.has(id))) {
      throw new BadRequestException('danh sach sap xep khong khop');
    }
    await this.prisma.$transaction(
      ids.map((id: string, i: number) => delegate.update({ where: { id }, data: { sortOrder: i } })),
    );
  }

  // ---------- Cai dat header/footer/favicon ----------
  private async getSettings(keys: string[]) {
    const rows = await this.prisma.siteSetting.findMany({ where: { key: { in: keys } } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = map.get(k) || '';
    return out;
  }

  private async putSettings(input: Record<string, string | undefined>, allowed: string[]) {
    for (const k of allowed) {
      if (input[k] === undefined) continue;
      const v = String(input[k]);
      await this.prisma.siteSetting.upsert({
        where: { key: k },
        create: { key: k, value: v },
        update: { value: v },
      });
    }
  }

  // SUA 2026-10-31: DTO controller + form CMS gui khoa ngan (phone,
  // image...) nhung putSettings truoc day tra khoa cham (header.phone...)
  // nen moi PUT deu bi bo qua lang le ma van tra 200 (toast thanh cong
  // gia). Map khoa ngan -> khoa cham o day; nhan ca khoa cham cu neu
  // co caller nao gui dang do, de khong vo tinh lam mat du lieu.
  private toDotted(input: Record<string, string | undefined>, prefix: string, fields: string[]) {
    const out: Record<string, string | undefined> = {};
    for (const f of fields) {
      const v = input[f] !== undefined ? input[f] : input[`${prefix}.${f}`];
      if (v !== undefined) out[`${prefix}.${f}`] = v;
    }
    return out;
  }

  async getHeader() {
    const s = await this.getSettings(['header.image', 'header.email', 'header.facebook', 'header.youtube', 'header.tiktok', 'header.zalo', 'header.phone']);
    return { image: s['header.image'], email: s['header.email'], facebook: s['header.facebook'], youtube: s['header.youtube'], tiktok: s['header.tiktok'], zalo: s['header.zalo'], phone: s['header.phone'] };
  }

  async putHeader(input: Record<string, string | undefined>) {
    const mapped = this.toDotted(input, 'header', ['image', 'email', 'facebook', 'youtube', 'tiktok', 'zalo', 'phone']);
    for (const k of ['header.facebook', 'header.youtube', 'header.tiktok', 'header.zalo']) {
      if (mapped[k] && !isHttpUrl(String(mapped[k]))) throw new BadRequestException('link mang xa hoi phai bat dau http(s)');
    }
    if (mapped['header.image'] && !isImageRef(String(mapped['header.image']))) throw new BadRequestException('anh header khong hop le');
    await this.putSettings(mapped, ['header.image', 'header.email', 'header.facebook', 'header.youtube', 'header.tiktok', 'header.zalo', 'header.phone']);
    return this.getHeader();
  }

  async getFooter() {
    const s = await this.getSettings(['footer.logo', 'footer.description', 'footer.copyright']);
    return { logo: s['footer.logo'], description: s['footer.description'], copyright: s['footer.copyright'] };
  }

  async putFooter(input: Record<string, string | undefined>) {
    const mapped = this.toDotted(input, 'footer', ['logo', 'description', 'copyright']);
    if (mapped['footer.logo'] && !isImageRef(String(mapped['footer.logo']))) throw new BadRequestException('anh footer khong hop le');
    await this.putSettings(mapped, ['footer.logo', 'footer.description', 'footer.copyright']);
    return this.getFooter();
  }

  async getFavicon() {
    const s = await this.getSettings(['favicon.image', 'favicon.name', 'favicon.description']);
    return { image: s['favicon.image'], name: s['favicon.name'], description: s['favicon.description'] };
  }

  async putFavicon(input: Record<string, string | undefined>) {
    const mapped = this.toDotted(input, 'favicon', ['image', 'name', 'description']);
    if (mapped['favicon.image'] && !isImageRef(String(mapped['favicon.image']))) throw new BadRequestException('anh favicon khong hop le');
    await this.putSettings(mapped, ['favicon.image', 'favicon.name', 'favicon.description']);
    return this.getFavicon();
  }

  // ---------- Cong khai ----------
  // Chi tra truong cong khai: ten/slug (khong id noi bo, khong email
  // nguoi dung, khong gi khac). Muc cha an hoac bai chua xuat ban bi loc.
  async publicPayload() {
    const now = new Date();
    // Cay chuyen muc hien (cung logic listCategoriesPublic).
    const cats = await this.prisma.newsCategory.findMany({
      where: { isVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const childrenOf = (parentId: string) =>
      cats.filter((c) => c.parentId === parentId).map((c) => ({ name: c.name, slug: c.slug }));

    const menuRows = await this.prisma.navMenuItem.findMany({ orderBy: { sortOrder: 'asc' } });
    const menu: any[] = [];
    for (const r of menuRows) {
      const cat = byId.get(r.categoryId);
      if (!cat) continue;
      menu.push({ name: cat.name, slug: cat.slug, children: childrenOf(cat.id) });
    }

    const homeRows = await this.prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    const homeSections: any[] = [];
    for (const r of homeRows) {
      const cat = byId.get(r.categoryId);
      if (!cat) continue;
      homeSections.push({ name: cat.name, slug: cat.slug });
    }

    const hotRows = await this.prisma.hotLink.findMany({ orderBy: { sortOrder: 'asc' } });
    const hotLinks: any[] = [];
    for (const r of hotRows) {
      const art = await this.prisma.newsArticle.findFirst({
        where: { OR: [{ id: r.articleId }, { publicId: r.articleId }] },
      });
      // Chi bai dang xuat ban that (dung trang thai + lich hen) moi hien.
      if (!art || art.status !== 'published' || (art.publishAt && art.publishAt > now)) continue;
      hotLinks.push({ title: art.title, slug: art.slug });
    }

    return {
      menu,
      homeSections,
      hotLinks,
      header: await this.getHeader(),
      footer: await this.getFooter(),
      favicon: await this.getFavicon(),
    };
  }
}
