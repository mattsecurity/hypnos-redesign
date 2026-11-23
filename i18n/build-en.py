#!/usr/bin/env python3
"""Builds the English site (dist/en/) from the Italian pages.

    python3 i18n/build-en.py

The Italian pages are the source. This script copies them into dist/en/, fixes the paths
(one folder deeper) and swaps every Italian string for its English translation.
Every Italian string must still be found: if a text changed in the Italian page, the
script stops and names it, so the English translation can be updated here first.
Run it again after every change to the Italian pages.
"""
import re
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / 'dist'
BASE = 'https://www.hypnosweb.it/'


def apply(src, pairs, name):
    """Replace each Italian string (all occurrences); longer strings first so overlaps resolve."""
    missing = []
    for it, en in sorted(pairs, key=lambda p: -len(p[0])):
        if it not in src:
            missing.append(it)
            continue
        src = src.replace(it, en)
    if missing:
        sys.exit(f'[{name}] Italian text not found (changed in the page? update the translation):\n  - '
                 + '\n  - '.join(m[:120] for m in missing))
    return src


def write(rel, html):
    out = DIST / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print('wrote', out.relative_to(DIST.parent))


# ------------------------------------------------------------------ shared (head, header, footer)
LEGAL = [
    ('HYPNOS Srl · Società a socio unico · Sede legale: Via del Gonfalone 3, 20123 Milano (MI) · Capitale sociale € 20.000,00 interamente versato · Partita IVA 10682130967 · REA MI-2550012 · PEC ',
     'HYPNOS Srl · Single-member company · Registered office: Via del Gonfalone 3, 20123 Milano (MI), Italy · Share capital €20,000.00 fully paid up · VAT no. IT10682130967 · REA MI-2550012 · PEC (certified email) '),
    ('© 2026 HYPNOS Srl · Tutti i diritti riservati', '© 2026 HYPNOS Srl · All rights reserved'),
    ('>Crediti immagini</a>', '>Image credits</a>'),
    ('<a class="skip" href="#contenuto">Vai al contenuto</a>', '<a class="skip" href="#contenuto">Skip to content</a>'),
    ('<html lang="it">', '<html lang="en">'),
    ('<meta property="og:locale" content="it_IT">\n<meta property="og:locale:alternate" content="en_GB">',
     '<meta property="og:locale" content="en_GB">\n<meta property="og:locale:alternate" content="it_IT">'),
    ('aria-label="Lingua · Language"', 'aria-label="Language · Lingua"'),
]


def lang_switch(it_href):
    """IT/EN switch as it appears on an Italian page -> the same switch for the English page."""
    return re.compile(r'<a href="[^"]*" hreflang="it" lang="it" aria-current="page" aria-label="Italiano"><span>IT</span></a>'
                      r'<a href="[^"]*" hreflang="en" lang="en" aria-label="English"><span>EN</span></a>'), (
        f'<a href="{it_href}" hreflang="it" lang="it" aria-label="Italiano"><span>IT</span></a>'
        '<a href="./" hreflang="en" lang="en" aria-current="page" aria-label="English"><span>EN</span></a>')


def switch(html, it_href, name):
    rx, rep = lang_switch(it_href)
    html, n = rx.subn(rep, html)
    if n != 1:
        sys.exit(f'[{name}] language switch not found')
    return html


# ------------------------------------------------------------------ home page
DESC_IT = 'Telecamere a lettura targhe, controllo della velocità puntuale e media, varchi ZTL, parcometri e software per Polizie Locali e Comuni: noleggio, vendita, installazione e gestione. Milano.'
DESC_EN = 'Number plate recognition cameras, spot and average speed enforcement, ZTL gates, parking meters and software for Local Police forces and municipalities: rental, sale, installation and management. Milan, Italy.'

HOME = [
    # head
    ('HYPNOS Srl — Tecnologie per la sicurezza stradale e la sosta', 'HYPNOS Srl — Road safety and parking technology'),
    (DESC_IT, DESC_EN),
    ('<link rel="canonical" href="https://www.hypnosweb.it/">', '<link rel="canonical" href="https://www.hypnosweb.it/en/">'),
    ('<meta property="og:url" content="https://www.hypnosweb.it/">', '<meta property="og:url" content="https://www.hypnosweb.it/en/">'),
    ('content="HYPNOS Srl · Via del Gonfalone 3, 20123 Milano (MI) · +39 02 4004 2393"', 'content="HYPNOS Srl · Via del Gonfalone 3, 20123 Milan, Italy · +39 02 4004 2393"'),
    # nav
    ('aria-label="HYPNOS Srl — inizio pagina"', 'aria-label="HYPNOS Srl — back to top"'),
    ('aria-label="Navigazione principale"', 'aria-label="Main navigation"'),
    ('>Soluzioni</a>', '>Solutions</a>'),
    ('>Sosta</a>', '>Parking</a>'),
    ('>Verbali</a>', '>Fines</a>'),
    ('>Azienda</a>', '>Company</a>'),
    ('>Certificazioni</a>', '>Certifications</a>'),
    ('>Contatti</a>', '>Contact</a>'),
    ('aria-label="Apri il menu"', 'aria-label="Open the menu"'),
    # story
    ('aria-label="Dalla città alla targa: come funziona la lettura targhe"', 'aria-label="From the city to the number plate: how plate recognition works"'),
    ('alt="Vista aerea di un viale di Milano all’ora blu"', 'alt="Aerial view of a Milan boulevard at blue hour"'),
    ('<b>VEICOLO IN TRANSITO</b><span>VIALE · CORSIA 1 · DIR. EST</span>', '<b>VEHICLE IN TRANSIT</b><span>BOULEVARD · LANE 1 · EASTBOUND</span>'),
    ('<span>PUNTO DI CONTROLLO · CAM 04</span>', '<span>CHECKPOINT · CAM 04</span>'),
    ('<span>CAM 04 · VIALE · DIREZIONE EST</span>', '<span>CAM 04 · BOULEVARD · EASTBOUND</span>'),
    ('<span>VEICOLO</span>', '<span>VEHICLE</span>'),
    ('<span>ITALIA</span><span>TARGA FITTIZIA</span>', '<span>ITALY</span><span>FICTITIOUS PLATE</span>'),
    ('<li><span>Targa</span>', '<li><span>Plate</span>'),
    ('<li><span>Velocità rilevata</span>', '<li><span>Detected speed</span>'),
    ('<li><span>Punto di controllo</span>', '<li><span>Checkpoint</span>'),
    ('<li><span>Transito</span><b>Registrato</b>', '<li><span>Transit</span><b>Logged</b>'),
    ('<li><span>Gestionale</span><b>Dato disponibile</b>', '<li><span>Management system</span><b>Data available</b>'),
    ('<i></i>Transito registrato <span', '<i></i>Transit logged <span'),
    ('<span>Telecamera a lettura targhe</span><span>Simulazione illustrativa · targa fittizia</span>', '<span>Number plate recognition camera</span><span>Illustrative simulation · fictitious plate</span>'),
    ('Sicurezza stradale · Sosta · Pubblica Amministrazione', 'Road safety · Parking · Public sector'),
    ('<h1>La città<br>ha mille occhi.<br><span>Noi li rendiamo intelligenti.</span></h1>', '<h1>The city<br>has a thousand eyes.<br><span>We make them smart.</span></h1>'),
    ('Telecamere a lettura targhe, controllo della velocità puntuale e media, varchi ZTL, parcometri e software. Al fianco di Comuni e Polizie Locali, dal progetto alla gestione.',
     'Number plate recognition cameras, spot and average speed enforcement, ZTL gates, parking meters and software. Working alongside municipalities and Local Police forces, from design to day-to-day management.'),
    ('<b>01</b> La città</p>', '<b>01</b> The city</p>'),
    ('<h2>Ogni giorno,<br>migliaia di passaggi.</h2>', '<h2>Every day,<br>thousands of vehicles.</h2>'),
    ('Flussi, accessi, velocità, soste. Ogni strada racconta qualcosa, a chi sa leggerla.', 'Traffic flows, access, speed, parking. Every street tells a story to those who can read it.'),
    ('<b>02</b> Il veicolo</p>', '<b>02</b> The vehicle</p>'),
    ('<h2>Un’auto entra<br>nel viale.</h2>', '<h2>A car turns<br>into the boulevard.</h2>'),
    ('Tra cento metri incontrerà un punto di controllo. Il sistema è già pronto a riconoscerla.', 'In a hundred metres it will reach a checkpoint. The system is already ready to recognise it.'),
    ('<b>03</b> Il punto di controllo</p>', '<b>03</b> The checkpoint</p>'),
    ('<h2>Un occhio che<br>non si distrae.</h2>', '<h2>An eye that<br>never looks away.</h2>'),
    ('Telecamere a lettura targhe in noleggio o in vendita, installate e mantenute da HYPNOS.', 'Number plate recognition cameras for rental or sale, installed and maintained by HYPNOS.'),
    ('<b>04</b> La lettura</p>', '<b>04</b> The reading</p>'),
    ('<h2>La targa, in una<br>frazione di secondo.</h2>', '<h2>The plate, in a<br>split second.</h2>'),
    ('La telecamera legge la targa del veicolo in transito.', 'The camera reads the number plate of the passing vehicle.'),
    ('<b>05</b> Dalla strada all’ufficio</p>', '<b>05</b> From the street to the office</p>'),
    ('<h2>Il dato arriva<br>al gestionale.</h2>', '<h2>The data reaches<br>the management system.</h2>'),
    ('<p>Sviluppiamo software per la gestione della sicurezza stradale, con un supporto professionale e continuativo.</p>', '<p>We develop road safety management software, backed by professional, ongoing support.</p>'),
    ('<span data-at="0">Città</span><span data-at=".31">Veicolo</span><span data-at=".5">Controllo</span><span data-at=".67">Lettura</span><span data-at=".81">Gestionale</span>',
     '<span data-at="0">City</span><span data-at=".31">Vehicle</span><span data-at=".5">Checkpoint</span><span data-at=".67">Reading</span><span data-at=".81">System</span>'),
    ('<span>Scorri per seguire il veicolo</span>', '<span>Scroll to follow the vehicle</span>'),
    # manifesto
    ('<p class="eyebrow">Chi è HYPNOS</p>', '<p class="eyebrow">Who we are</p>'),
    ('HYPNOS affianca Comandi di Polizia Locale e amministrazioni con tecnologie innovative e sviluppo software. Seguiamo ogni progetto dall’analisi delle esigenze all’installazione, dalla manutenzione alla gestione operativa, dal back office al front end.',
     'HYPNOS supports Local Police departments and public authorities with innovative technology and software development. We follow every project from needs analysis to installation, from maintenance to day-to-day operations, from back office to front end.'),
    ('<span>Noleggio</span>', '<span>Rental</span>'),
    ('<span>Vendita</span>', '<span>Sale</span>'),
    ('<span>Gestione integrata</span>', '<span>Integrated management</span>'),
    ('<span>Supporto tecnico</span>', '<span>Technical support</span>'),
    ('<span>Consulenza</span>', '<span>Consulting</span>'),
    # solutions
    ('<p class="eyebrow">Le soluzioni</p>', '<p class="eyebrow">Our solutions</p>'),
    ('Sei strumenti.<br>Un unico interlocutore.', 'Six tools.<br>One single partner.'),
    ('Apparecchiature in noleggio o in vendita, installate e mantenute dai nostri tecnici, con la gestione del servizio quando serve.',
     'Equipment for rental or sale, installed and maintained by our technicians, with full service management when needed.'),
    ('alt="Telecamera per lettura targhe su palo, al crepuscolo"', 'alt="Number plate recognition camera on a pole at dusk"'),
    ('<h3>Telecamere a lettura targhe</h3>', '<h3>Number plate recognition cameras</h3>'),
    ('<p>Telecamere a lettura targhe in noleggio o in vendita, con installazione, manutenzione e supporto tecnico.</p>',
     '<p>Number plate recognition cameras for rental or sale, with installation, maintenance and technical support.</p>'),
    ('<li>Noleggio o vendita</li>', '<li>Rental or sale</li>'),
    ('<li>Installazione e manutenzione</li>', '<li>Installation and maintenance</li>'),
    ('<li>Supporto tecnico</li>', '<li>Technical support</li>'),
    ('alt="Postazione fissa di rilevamento velocità a bordo di una strada extraurbana"', 'alt="Fixed speed enforcement unit beside a rural road"'),
    ('<h3>Controllo della velocità puntuale</h3>', '<h3>Spot speed enforcement</h3>'),
    ('Apparecchiature per il controllo puntuale della velocità dei veicoli, in noleggio o in vendita, con la gestione del servizio integrato dei verbali generati dal servizio.',
     'Equipment for spot speed enforcement, for rental or sale, with management of the integrated service for the penalty notices it generates.'),
    ('<li>Gestione dei verbali</li>', '<li>Penalty notice management</li>'),
    ('alt="Portale di controllo della velocità media sopra un’autostrada all’ora blu"', 'alt="Average speed enforcement gantry over a motorway at blue hour"'),
    ('<h3>Controllo della velocità media</h3>', '<h3>Average speed enforcement</h3>'),
    ('Sistemi per il controllo della velocità media sulla tratta, in noleggio o in vendita, con la relativa gestione e il servizio integrato dei verbali.',
     'Systems for average speed enforcement over a road section, for rental or sale, with full management and the integrated penalty notice service.'),
    ('<li>Controllo della velocità</li>', '<li>Speed enforcement</li>'),
    ('alt="Varco ZTL con pannello luminoso in un centro storico"', 'alt="ZTL gate with an illuminated sign in a historic town centre"'),
    ('<h3>Varchi ZTL</h3>', '<h3>ZTL gates</h3>'),
    ('Apparecchiature per le zone a traffico limitato, in noleggio o in vendita, con installazione, manutenzione e relativa gestione.',
     'Equipment for limited traffic zones (ZTL), for rental or sale, with installation, maintenance and management.'),
    ('>Relativa gestione<', '>Management<'),
    ('alt="Parcometro su un marciapiede di Milano accanto a stalli blu"', 'alt="Parking meter on a Milan pavement next to blue parking bays"'),
    ('>Parcometri<', '>Parking meters<'),
    ('Gestione integrata della sosta a pagamento: fornitura, installazione e manutenzione dei parcometri, segnaletica e personale qualificato. Chiavi in mano.',
     'Integrated management of paid parking: supply, installation and maintenance of parking meters, road markings and qualified staff. Turnkey.'),
    ('<li>Fornitura e posa</li>', '<li>Supply and installation</li>'),
    ('<li>Segnaletica</li>', '<li>Road markings</li>'),
    ('<li>Gestione del servizio</li>', '<li>Service management</li>'),
    ('alt="Sala operativa con monitor di videosorveglianza stradale"', 'alt="Control room with road surveillance monitors"'),
    ('<h3>Software per la PA</h3>', '<h3>Software for the public sector</h3>'),
    ('Sviluppiamo software per la gestione della sicurezza stradale e affianchiamo la pubblica amministrazione con un supporto professionale e continuativo.',
     'We develop road safety management software and support public authorities with professional, ongoing assistance.'),
    ('<li>Sviluppo su misura</li>', '<li>Custom development</li>'),
    ('<li>Formazione</li>', '<li>Training</li>'),
    ('<li>Assistenza continuativa</li>', '<li>Ongoing assistance</li>'),
    ('<p>Non sai da dove partire?</p>', '<p>Not sure where to start?</p>'),
    ('>Parliamone</a>', '>Let’s talk</a>'),
    # parking
    ('<p class="eyebrow">Gestione della sosta a pagamento</p>', '<p class="eyebrow">Paid parking management</p>'),
    ('La sosta, chiavi in mano.', 'Parking, turnkey.'),
    ('Affianchiamo i Comandi di Polizia Locale nella gestione integrata delle aree in cui la sosta dei veicoli è regolamentata e soggetta al pagamento tramite parcometri. Fornitura, installazione, manutenzione, segnaletica e gestione: tutto chiavi in mano.',
     'We support Local Police departments in the integrated management of areas where parking is regulated and paid for at parking meters. Supply, installation, maintenance, road markings and management: all turnkey.'),
    ('<b>Fornitura</b>', '<b>Supply</b>'),
    ('Fornitura dei parcometri.', 'Supply of parking meters.'),
    ('<b>Installazione</b>', '<b>Installation</b>'),
    ('Installazione dei parcometri su strada.', 'Installation of parking meters on the street.'),
    ('<b>Segnaletica</b>', '<b>Road markings</b>'),
    ('Realizzazione della segnaletica orizzontale e verticale.', 'Painting road markings and putting up road signs.'),
    ('<b>Manutenzione</b>', '<b>Maintenance</b>'),
    ('Manutenzione dei parcometri.', 'Parking meter maintenance.'),
    ('<b>Gestione</b>', '<b>Management</b>'),
    ('Gestione con personale altamente qualificato.', 'Management by highly qualified staff.'),
    ('<b id="pk-cap-t">Fornitura</b>', '<b id="pk-cap-t">Supply</b>'),
    ('aria-label="Simulazione illustrativa di una via con stalli di sosta a pagamento"', 'aria-label="Illustrative simulation of a street with paid parking bays"'),
    ('<b>01</b> Fornitura</div>', '<b>01</b> Supply</div>'),
    ('alt="Parcometro su un marciapiede di Milano"', 'alt="Parking meter on a Milan pavement"'),
    ('<span class="pk-front__cap">Fornitura dei parcometri</span>', '<span class="pk-front__cap">Supply of parking meters</span>'),
    ('<span>Installazione del parcometro</span>', '<span>Installing the parking meter</span>'),
    ('<span>Occupazione</span>', '<span>Occupancy</span>'),
    ('<span>Stalli liberi</span>', '<span>Free bays</span>'),
    ('<span>Riscosso (simulazione)</span><b id="pk-rev">€ 0,00</b>', '<span>Collected (simulation)</span><b id="pk-rev">€0.00</b>'),
    ('Simulazione illustrativa · dati fittizi', 'Illustrative simulation · fictitious data'),
    # penalty notices pipeline
    ('Controllo della velocità puntuale e media, ZTL e relativa gestione', 'Spot and average speed enforcement, ZTL and their management'),
    ('Dal rilevamento al verbale.<br>Un servizio integrato.', 'From detection to penalty notice.<br>One integrated service.'),
    ('Affianchiamo i Comandi di Polizia Locale con il noleggio e/o la vendita di apparecchiature per il controllo della velocità dei veicoli e la gestione del servizio integrato dei verbali generati dal servizio.',
     'We support Local Police departments with the rental and/or sale of vehicle speed enforcement equipment and the management of the integrated service for the penalty notices it generates.'),
    ('>Apparecchiature<', '>Equipment<'),
    ('Controllo della velocità puntuale e media e varchi ZTL, in noleggio e/o vendita.', 'Spot and average speed enforcement and ZTL gates, for rental and/or sale.'),
    ('<b>Controllo della velocità</b>', '<b>Speed enforcement</b>'),
    ('Le apparecchiature rilevano la velocità dei veicoli.', 'The equipment measures vehicle speeds.'),
    ('<b>Gestione dei verbali</b>', '<b>Penalty notice management</b>'),
    ('Il servizio integrato dei verbali generati dal servizio.', 'The integrated service for the penalty notices generated.'),
    ('<span>Software per la gestione della sicurezza stradale.</span>', '<span>Road safety management software.</span>'),
    ('<b>Supporto continuativo</b>', '<b>Ongoing support</b>'),
    ('Affiancamento professionale alla pubblica amministrazione.', 'Professional support for public authorities.'),
    ('aria-label="Esempio illustrativo del flusso di gestione di un evento"', 'aria-label="Illustrative example of how an event is handled"'),
    ('Fascicolo<span class="pv-bar__x"> evento</span>', 'Case<span class="pv-bar__x"> file</span>'),
    ('>Velocità media<', '>Average speed<'),
    ('>Velocità puntuale<', '>Spot speed<'),
    ('<em>Veicolo</em>', '<em>Vehicle</em>'),
    ('Controllo della velocità · simulazione', 'Speed enforcement · simulation'),
    ('<span>km/h rilevati</span>', '<span>km/h detected</span>'),
    ('<span>Lettura targa</span>', '<span>Plate reading</span>'),
    ('<span>Limite (esempio)</span>', '<span>Limit (example)</span>'),
    ('<span>Esito</span><b class="pv-verdict">Oltre il limite</b>', '<span>Outcome</span><b class="pv-verdict">Over the limit</b>'),
    ('<b>Verbale</b><span>Servizio integrato dei verbali</span>', '<b>Penalty notice</b><span>Integrated penalty notice service</span>'),
    ('<dt>Targa</dt>', '<dt>Plate</dt>'),
    ('<dt>Velocità rilevata</dt>', '<dt>Detected speed</dt>'),
    ('<dt>Data</dt>', '<dt>Date</dt>'),
    ('<dt>Apparecchiatura</dt><dd data-type="Controllo velocità">Controllo velocità</dd>', '<dt>Device</dt><dd data-type="Speed check">Speed check</dd>'),
    ('<dt>Stato</dt><dd data-type="In gestione">In gestione</dd>', '<dt>Status</dt><dd data-type="Processing">Processing</dd>'),
    ('Esempio illustrativo<br><small>dati e targa fittizi</small>', 'Illustrative example<br><small>fictitious data and plate</small>'),
    ('<span>Targa</span><span>Apparecchiatura</span><span>Stato</span>', '<span>Plate</span><span>Device</span><span>Status</span>'),
    ('<em>Gestito</em>', '<em>Handled</em>'),
    ('Analisi delle esigenze', 'Needs analysis'),
    ('Supporto in fase di progettazione', 'Support during design'),
    ('<b>Installazione e manutenzione dei dispositivi</b>', '<b>Device installation and maintenance</b>'),
    ('Gestione operativa, dal back office al front end', 'Day-to-day operations, from back office to front end'),
    ('<b>Supporto professionale e continuativo</b>', '<b>Professional, ongoing support</b>'),
    ('Esempio illustrativo · dati fittizi', 'Illustrative example · fictitious data'),
    # software
    ('Sviluppo software per Polizie Locali e PA', 'Software development for Local Police and public authorities'),
    ('Meno complessità.<br>Più controllo.', 'Less complexity.<br>More control.'),
    ('La tecnologia in strada ha bisogno di strumenti chiari in ufficio. Sviluppiamo software per la gestione della sicurezza stradale e restiamo al fianco degli operatori con un supporto professionale e continuativo.',
     'Technology on the street needs clear tools in the office. We develop road safety management software and stay alongside operators with professional, ongoing support.'),
    ('<b>PA</b><span>Software per Polizie Locali e Pubbliche Amministrazioni</span>', '<b>Gov</b><span>Software for Local Police forces and public authorities</span>'),
    ('<span>Interlocutore, dall’analisi alla gestione operativa</span>', '<span>Partner, from analysis to day-to-day operations</span>'),
    ('<span>Dal back office al front end</span>', '<span>From back office to front end</span>'),
    ('aria-label="Esempio illustrativo di interfaccia gestionale"', 'aria-label="Illustrative example of a management interface"'),
    ('HYPNOS · Centrale transiti', 'HYPNOS · Transit centre'),
    ('<span>Transiti oggi</span><b id="dash-count">12.480</b>', '<span>Transits today</span><b id="dash-count">12,480</b>'),
    ('<span>Ora</span><span>Targa</span><span>Varco</span><span>Stato</span>', '<span>Time</span><span>Plate</span><span>Gate</span><span>Status</span>'),
    ('Interfaccia illustrativa · dati fittizi', 'Illustrative interface · fictitious data'),
    # method
    ('<p class="eyebrow">Il nostro metodo</p>', '<p class="eyebrow">Our method</p>'),
    ('Dall’analisi alla gestione.<br>Sempre al vostro fianco.', 'From analysis to management.<br>Always by your side.'),
    ('<p>Partiamo dalle esigenze del cliente.</p>', '<p>We start from the client’s needs.</p>'),
    ('<h3>Progettazione</h3>', '<h3>Design</h3>'),
    ('<h3>Installazione</h3>', '<h3>Installation</h3>'),
    ('<p>Installazione dei dispositivi.</p>', '<p>Device installation.</p>'),
    ('<h3>Manutenzione</h3>', '<h3>Maintenance</h3>'),
    ('<p>Manutenzione dei dispositivi e supporto tecnico.</p>', '<p>Device maintenance and technical support.</p>'),
    ('<h3>Gestione operativa</h3>', '<h3>Day-to-day operations</h3>'),
    # company
    ('HYPNOS Srl · Milano</p>', 'HYPNOS Srl · Milan</p>'),
    ('Tecnologia al servizio di chi si prende cura della città.', 'Technology for those who look after the city.'),
    ('Ci rivolgiamo a Comandanti, Funzionari e Operatori di Polizia Locale, con un ricco assortimento di servizi: dal noleggio alla vendita, fino al supporto tecnico dei gestionali progettati. Dalla presentazione di prodotti e servizi per l’attività in ufficio e in strada, fino all’installazione.',
     'We work with Local Police commanders, officials and officers, offering a wide range of services: from rental and sale to technical support for the management systems we design. From presenting products and services for office and street work, all the way to installation.'),
    ('<li>Comandanti</li><li>Funzionari</li><li>Operatori di Polizia Locale</li><li>Comuni ed Enti locali</li>',
     '<li>Commanders</li><li>Officials</li><li>Local Police officers</li><li>Municipalities and local authorities</li>'),
    ('<span class="tributi__tag">Anche</span>', '<span class="tributi__tag">Also</span>'),
    ('>Gestione tributi<', '>Local tax management<'),
    ('Partner affidabile di Comuni ed Enti locali, con lo scopo di contribuire al raggiungimento dei loro obiettivi.', 'A reliable partner for municipalities and local authorities, helping them reach their goals.'),
    ('Richiedi informazioni <span', 'Request information <span'),
    ('>Lettura targhe<', '>Plate recognition<'),
    ('>Controllo della velocità puntuale<', '>Spot speed enforcement<'),
    ('>Controllo della velocità media<', '>Average speed enforcement<'),
    # certifications
    ('<p class="eyebrow">Sistemi di gestione certificati</p>', '<p class="eyebrow">Certified management systems</p>'),
    ('Qualità, ambiente, dati.<br>Tutto certificato.', 'Quality, environment, data.<br>All certified.'),
    ('HYPNOS lavora con tre sistemi di gestione certificati secondo le norme internazionali ISO, verificati da un organismo di certificazione indipendente. Passa il cursore o tocca una certificazione per scoprire cosa garantisce.',
     'HYPNOS operates three management systems certified to international ISO standards and audited by an independent certification body. Hover over or tap a certification to see what it guarantees.'),
    ('SISTEMA DI GESTIONE PER LA QUALITÀ · CERTIFICATO ·', 'QUALITY MANAGEMENT SYSTEM · ISO 9001 · CERTIFIED ·'),
    ('SISTEMA DI GESTIONE AMBIENTALE · CERTIFICATO ·', 'ENVIRONMENTAL MANAGEMENT SYSTEM · CERTIFIED ·'),
    ('SICUREZZA DELLE INFORMAZIONI · CERTIFICATO ·', 'INFORMATION SECURITY MANAGEMENT · CERTIFIED ·'),
    ('<h3>Gestione della qualità</h3>', '<h3>Quality management</h3>'),
    ('Processi definiti, misurati e migliorati di continuo: dalla fornitura all’installazione, fino all’assistenza.',
     'Defined, measured and continuously improved processes: from supply and installation through to after-sales support.'),
    ('>Cosa garantisce <i', '>What it guarantees <i'),
    (' · Cosa prevede</p>', ' · What it requires</p>'),
    ('Processi documentati per fornitura, installazione, manutenzione e assistenza', 'Documented processes for supply, installation, maintenance and support'),
    ('Controllo e qualifica dei fornitori', 'Supplier control and qualification'),
    ('Misura della soddisfazione del cliente e gestione dei reclami', 'Customer satisfaction measurement and complaint handling'),
    ('Obiettivi di miglioramento e verifiche periodiche di un ente terzo', 'Improvement objectives and periodic third-party audits'),
    ('<p class="cert__k">Per il vostro Comando</p>', '<p class="cert__k">For your department</p>'),
    ('Servizi e tempi d’intervento prevedibili, con un metodo verificato. Un requisito spesso richiesto nelle gare pubbliche.',
     'Predictable services and response times, backed by an audited method. Often a requirement in public tenders.'),
    ('aria-label="Chiudi dettagli ', 'aria-label="Close details for '),
    ('>Chiudi <i', '>Close <i'),
    ('<h3>Gestione ambientale</h3>', '<h3>Environmental management</h3>'),
    ('Gli impatti ambientali delle attività, dai trasporti ai rifiuti, sono individuati, tenuti sotto controllo e ridotti.',
     'The environmental impact of our work, from transport to waste, is identified, kept under control and reduced.'),
    ('Analisi degli aspetti ambientali: energia, trasporti, materiali', 'Analysis of environmental aspects: energy, transport, materials'),
    ('Gestione corretta dei rifiuti, anche elettronici', 'Proper waste management, including electronic waste'),
    ('Rispetto costante della normativa ambientale', 'Ongoing compliance with environmental legislation'),
    ('Obiettivi ambientali misurabili e riesaminati', 'Measurable, regularly reviewed environmental objectives'),
    ('Un fornitore che riduce l’impatto delle attività in strada e in ufficio, in linea con i Criteri Ambientali Minimi negli appalti pubblici.',
     'A supplier that reduces the impact of its work on the street and in the office, in line with the Minimum Environmental Criteria (CAM) for Italian public procurement.'),
    ('<h3>Sicurezza delle informazioni</h3>', '<h3>Information security</h3>'),
    ('Un sistema di gestione (SGSI) che protegge riservatezza, integrità e disponibilità dei dati trattati.',
     'A management system (ISMS) that protects the confidentiality, integrity and availability of the data we process.'),
    ('Analisi e trattamento dei rischi sulle informazioni', 'Information risk assessment and treatment'),
    ('Accessi a dati e sistemi controllati e tracciati', 'Controlled, logged access to data and systems'),
    ('Gestione degli incidenti e continuità operativa', 'Incident management and business continuity'),
    ('I 93 controlli di sicurezza previsti dalla norma', 'The 93 security controls set out in the standard'),
    ('Targhe, transiti e verbali sono dati personali: vengono trattati con controlli verificati, a supporto della conformità al GDPR.',
     'Number plates, transits and penalty notices are personal data: they are processed under audited controls, supporting GDPR compliance.'),
    ('<b>Ente indipendente</b><span>Certificazioni rilasciate da un organismo terzo, non dall’azienda stessa.</span>',
     '<b>Independent body</b><span>Certifications issued by a third-party body, not by the company itself.</span>'),
    ('<b>Verifiche periodiche</b><span>Audit di sorveglianza annuali e rinnovo completo ogni tre anni.</span>',
     '<b>Regular audits</b><span>Annual surveillance audits and full recertification every three years.</span>'),
    ('<b>Copia dei certificati</b><span>Disponibile su richiesta per gare e albi fornitori', '<b>Copies of the certificates</b><span>Available on request for tenders and supplier registers'),
    # contact
    ('<p class="eyebrow">Hai bisogno di una consulenza?</p>', '<p class="eyebrow">Need advice?</p>'),
    ('>Parliamone.</h2>', '>Let’s talk.</h2>'),
    ('Offriamo consulenza e supporto alle amministrazioni locali, per garantire un servizio continuativo di sicurezza stradale.', 'We offer advice and support to local authorities, to ensure an ongoing road safety service.'),
    ('<dt>Sede</dt>', '<dt>Address</dt>'),
    ('20123 Milano, Italia</a>', '20123 Milan, Italy</a>'),
    ('<dt>Telefono</dt>', '<dt>Phone</dt>'),
    ('>Scrivici su WhatsApp</a>', '>Message us on WhatsApp</a>'),
    ('<label for="f-name">Nome e cognome</label>', '<label for="f-name">Full name</label>'),
    ('<label for="f-ente">Ente o Comando</label>', '<label for="f-ente">Organisation or department</label>'),
    ('<label for="f-phone">Telefono</label>', '<label for="f-phone">Phone</label>'),
    ('<legend>Ti interessa</legend>', '<legend>Interested in</legend>'),
    ('value="Lettura targhe"', 'value="Plate recognition"'),
    ('value="Controllo della velocità puntuale"', 'value="Spot speed enforcement"'),
    ('value="Controllo della velocità media"', 'value="Average speed enforcement"'),
    ('value="Parcometri"', 'value="Parking meters"'),
    ('value="Gestione tributi"><span>Tributi</span>', 'value="Local tax management"><span>Local taxes</span>'),
    ('<label for="f-msg">Messaggio</label>', '<label for="f-msg">Message</label>'),
    ('<span>Ho letto l’<a href="privacy/" target="_blank">informativa privacy</a>.</span>', '<span>I have read the <a href="privacy/" target="_blank">privacy notice</a>.</span>'),
    ('<span>Prepara la richiesta</span>', '<span>Prepare the request</span>'),
    ('La richiesta si aprirà nel tuo programma di posta, pronta da inviare.', 'The request will open in your email app, ready to send.'),
    # logo intro
    ('<p class="intro__tag">Soluzioni integrate per città più sicure</p>', '<p class="intro__tag">Integrated solutions for safer cities</p>'),
    # footer
    ('<small>Soluzioni integrate per città più sicure</small>', '<small>Integrated solutions for safer cities</small>'),
    ('aria-label="Collegamenti a piè di pagina"', 'aria-label="Footer links"'),
    ('<a href="crediti/">', '<a href="credits/">'),
    # mail dialog
    ('<p class="eyebrow">La tua richiesta</p>', '<p class="eyebrow">Your request</p>'),
    ('<h2 id="mail-title">Pronta per HYPNOS.</h2>', '<h2 id="mail-title">Ready for HYPNOS.</h2>'),
    ('Controlla il riepilogo: il messaggio partirà solo quando lo confermerai dal tuo programma di posta.', 'Check the summary: the message is only sent once you confirm it in your email app.'),
    ('Compila il modulo per vedere qui il riepilogo.', 'Fill in the form to see the summary here.'),
    ('>Modifica</button>', '>Edit</button>'),
    ('>Apri e-mail</a>', '>Open email</a>'),
]


def build_home():
    src = (DIST / 'index.html').read_text(encoding='utf-8')
    html = apply(src, HOME + LEGAL, 'en/index.html')
    html = switch(html, '../', 'en/index.html')
    # one folder deeper: page assets, styles, scripts and the import map
    for attr in ('href', 'src'):
        for d in ('assets', 'css', 'js', 'vendor'):
            html = html.replace(f'{attr}="{d}/', f'{attr}="../{d}/')
    html = html.replace('"./vendor/', '"../vendor/')
    write('en/index.html', html)


# ------------------------------------------------------------------ privacy and credits
def build_doc(it_dir, en_dir, title_pairs, main_en):
    name = f'en/{en_dir}/index.html'
    src = (DIST / it_dir / 'index.html').read_text(encoding='utf-8')
    a, b = src.index('<main id="contenuto"'), src.index('</main>') + len('</main>')
    src = src[:a] + main_en.strip() + src[b:]
    html = apply(src, title_pairs + LEGAL + [
        (f'<link rel="canonical" href="{BASE}{it_dir}/">', f'<link rel="canonical" href="{BASE}en/{en_dir}/">'),
        ('aria-label="HYPNOS Srl — torna alla home"', 'aria-label="HYPNOS Srl — back to the home page"'),
        ('>Torna al sito</a>', '>Back to site</a>'),
        ('<a href="../crediti/">', '<a href="../credits/">'),
    ], name)
    html = switch(html, f'../../{it_dir}/', name)
    html = html.replace('"../assets/', '"../../assets/').replace('"../css/', '"../../css/')
    write(name, html)


PRIVACY_TITLE = [
    ('Informativa privacy — HYPNOS Srl', 'Privacy notice — HYPNOS Srl'),
    ('Come HYPNOS Srl tratta i dati di chi visita il sito e di chi la contatta: finalità, conservazione, fornitori e diritti.',
     'How HYPNOS Srl handles the data of website visitors and of people who contact it: purposes, retention, providers and rights.'),
]
PRIVACY_MAIN = '''
<main id="contenuto" tabindex="-1">
<article class="doc"><div class="wrap">
  <p class="eyebrow">Notice under Articles 13 and 14 of Regulation (EU) 2016/679 (GDPR)</p>
  <h1>Privacy notice</h1>
  <p class="doc__lead">How HYPNOS Srl handles the personal data of people who visit this website and of people who write to us through the contact form, by email, phone or WhatsApp.</p>
  <p class="doc__date">Last updated: 1 November 2026 · This is a translation: in case of discrepancy, the <a href="../../privacy/" lang="it">Italian version</a> prevails.</p>

  <h2>1. Data controller</h2>
  <div class="doc__box">
    <p><strong>HYPNOS Srl</strong>, single-member company<br>
    Registered office: Via del Gonfalone 3, 20123 Milano (MI), Italy<br>
    VAT no. IT10682130967 · REA MI-2550012<br>
    Email: <a href="mailto:info@hypnosweb.it">info@hypnosweb.it</a> · PEC (certified email): <a href="mailto:info@pec.hypnosweb.it">info@pec.hypnosweb.it</a><br>
    Phone: <a href="tel:+390240042393">+39 02 4004 2393</a></p>
  </div>

  <h2>2. What data we process</h2>
  <h3>Data you send us with the contact form</h3>
  <p>Full name, organisation or department (optional), email address, phone number (optional), the topics you are interested in and the text of your message.</p>
  <p>The form <strong>does not send any data to a server</strong>: it prepares a message that opens in your email app. The data only reaches HYPNOS when you decide to send that email. Until then it stays on your device.</p>
  <h3>Data you send us by email, PEC, phone or WhatsApp</h3>
  <p>Your contact details and the information you choose to share with us.</p>
  <h3>Browsing data</h3>
  <p>As with any website, the provider hosting the pages automatically logs some technical data about requests (IP address, date and time, page requested, browser type), which is needed to run the site and protect it from abuse. We do not use it to identify visitors.</p>

  <h2>3. Why we process it and on what legal basis</h2>
  <ul>
    <li><strong>To answer your requests</strong> for information, quotes or advice: pre-contractual measures requested by the data subject (Art. 6(1)(b) GDPR) and, for requests made on behalf of an organisation, HYPNOS’s legitimate interest in following up on the contacts it receives (Art. 6(1)(f)).</li>
    <li><strong>Website security and operation</strong> (browsing data): legitimate interest (Art. 6(1)(f)).</li>
    <li><strong>Legal obligations</strong>, if the request leads to a contract (for example tax and accounting obligations): Art. 6(1)(c).</li>
  </ul>
  <p>We do not use your data for advertising or newsletters and we do not pass it on to third parties for commercial purposes. We do not take decisions based solely on automated processing.</p>
  <p>Providing your data is optional, but without your name, email and message we cannot reply to you.</p>

  <h2>4. How long we keep it</h2>
  <ul>
    <li><strong>Contact requests</strong>: for as long as needed to handle the request and then for no more than 24 months after the last exchange, unless they become part of a contract.</li>
    <li><strong>Data related to a contract</strong>: for 10 years after it ends, as required by Italian civil and tax law.</li>
    <li><strong>Browsing data</strong>: for the period set by the hosting provider for security purposes, usually a few days.</li>
  </ul>

  <h2>5. Who may process it</h2>
  <p>Authorised and trained HYPNOS staff, and the providers that supply the services we need, appointed as data processors (Art. 28 GDPR):</p>
  <ul>
    <li><strong>Cloudflare, Inc.</strong>: hosting and delivery of the website pages (browsing data).</li>
    <li><strong>HYPNOS’s mailbox provider</strong>: receiving and storing emails and PEC messages.</li>
  </ul>
  <p>Cloudflare is based in the United States and participates in the EU-U.S. Data Privacy Framework; the transfer is based on the European Commission’s adequacy decision (Art. 45 GDPR) and, in addition, on standard contractual clauses.</p>
  <p>If you contact us via WhatsApp, that data is also processed by WhatsApp Ireland Ltd under its own privacy policy.</p>

  <h2>6. Cookies and third-party tools</h2>
  <p>This website <strong>does not use cookies</strong>, nor any analytics, profiling or advertising tools. Fonts, libraries and images are served by the site itself, with no requests to external services while you browse. That is why there is no cookie banner.</p>
  <p>The links to Google Maps and WhatsApp open third-party websites, whose own privacy policies apply only if you choose to open them.</p>

  <h2>7. Your rights</h2>
  <p>You can ask at any time to access, correct or delete your data, restrict its processing, receive it in a portable format and object to processing based on legitimate interest (Arts. 15–22 GDPR). Write to <a href="mailto:info@hypnosweb.it">info@hypnosweb.it</a> or by PEC to <a href="mailto:info@pec.hypnosweb.it">info@pec.hypnosweb.it</a>: we reply within one month.</p>
  <p>If you believe the processing breaches the GDPR, you can lodge a complaint with the Italian data protection authority, the <strong>Garante per la protezione dei dati personali</strong>, Piazza Venezia 11, 00187 Rome, <a href="https://www.garanteprivacy.it" rel="noopener">www.garanteprivacy.it</a>.</p>

  <h2>8. Changes</h2>
  <p>We may update this notice, for example if the website’s services change. The date at the top shows the latest version.</p>
</div></article>
</main>
'''

CREDITS_TITLE = [
    ('Crediti immagini — HYPNOS Srl', 'Image credits — HYPNOS Srl'),
    ('Fonti e licenze delle immagini, dei modelli 3D e dei caratteri usati nel sito di HYPNOS Srl.',
     'Sources and licences of the images, 3D models and fonts used on the HYPNOS Srl website.'),
]
_AI = 'Generated with artificial intelligence for this website'
CREDITS_MAIN = f'''
<main id="contenuto" tabindex="-1">
<article class="doc"><div class="wrap">
  <p class="eyebrow">Sources and licences</p>
  <h1>Image credits</h1>
  <p class="doc__lead">Where the images and 3D models used on this website come from, and under what permission.</p>
  <p class="doc__date">Last updated: 1 November 2026</p>

  <h2>Photographs</h2>
  <p>All the photographs on this website are <strong>illustrative images generated with artificial intelligence</strong> (OpenAI’s image generator, used through Codex) specifically for this website. They do not show products sold by HYPNOS, recognisable places or real people. Number plates, speeds, check results and the data shown are fictitious.</p>
  <p>Under OpenAI’s terms of use, the rights to generated content belong to whoever generated it; the images are used here on behalf of HYPNOS Srl.</p>
  <table>
    <thead><tr><th>Image</th><th>Where it appears</th><th>Source</th></tr></thead>
    <tbody>
      <tr><td><img class="thumb" src="../assets/img/aerial.webp" alt="" loading="lazy">Aerial view of a boulevard at blue hour</td><td>Website opening (3D sequence) and software dashboard</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/aerial-lod1.webp" alt="" loading="lazy">Detail of the aerial view</td><td>3D sequence, close-up shots</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/anpr.webp" alt="" loading="lazy">Number plate recognition camera on a pole</td><td>Solutions · Number plate recognition cameras</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/autovelox.webp" alt="" loading="lazy">Speed enforcement unit</td><td>Solutions · Spot speed enforcement; Fines</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/tutor.webp" alt="" loading="lazy">Average speed enforcement gantry</td><td>Solutions · Average speed enforcement; Fines (background)</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/ztl.webp" alt="" loading="lazy">ZTL gate in a historic town centre</td><td>Solutions · ZTL gates; Fines</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/parcometro.webp" alt="" loading="lazy">Parking meter on a pavement</td><td>Solutions · Parking meters</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/control.webp" alt="" loading="lazy">Control room with monitors</td><td>Solutions · Software for the public sector</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/speed-shot.webp" alt="" loading="lazy">Speed check frame with the fictitious plate AB 123 CD</td><td>Fines · Speed enforcement</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/parcometro-front.webp" alt="" loading="lazy">Parking meter, front view</td><td>Parking · Supply</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/parking-street.webp" alt="" loading="lazy">Street with blue parking bays seen from above</td><td>Parking · simulation</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/van-top.webp" alt="" loading="lazy">Service van seen from above</td><td>Parking · Installation and Maintenance</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/meter-top.webp" alt="" loading="lazy">Parking meter seen from above</td><td>Parking · simulation</td><td>{_AI}</td></tr>
      <tr><td><img class="thumb" src="../assets/img/cars/car-1.webp" alt="" loading="lazy">Cars seen from above (18 generic models, no brands)</td><td>Parking · simulation</td><td>{_AI}</td></tr>
    </tbody>
  </table>

  <h2>3D models, textures and fonts</h2>
  <table>
    <thead><tr><th>Item</th><th>Source</th><th>Licence</th></tr></thead>
    <tbody>
      <tr><td>Camera, pole, city and road signs in the 3D sequence</td><td>Built in code for this website</td><td>HYPNOS Srl</td></tr>
      <tr><td>Saloon car in the 3D sequence</td><td><a href="https://github.com/ChenZongHeng/car" rel="noopener">ChenZongHeng/car</a>, original logos and plate removed</td><td>MIT</td></tr>
      <tr><td>Driver in the 3D sequence</td><td>Ready Player Me avatar from the <a href="https://github.com/mrdoob/three.js" rel="noopener">three.js</a> examples, modified</td><td>As per the three.js examples</td></tr>
      <tr><td>Night sky, asphalt and pavement slabs</td><td><a href="https://polyhaven.com" rel="noopener">Poly Haven</a> (rooftop_night, asphalt_04, concrete_pavement_02)</td><td>CC0</td></tr>
      <tr><td>Hedges, roses and grass on the central reservation</td><td>Generated with artificial intelligence for this website</td><td>—</td></tr>
      <tr><td>HYPNOS logo</td><td>HYPNOS Srl</td><td>Trademark of HYPNOS Srl</td></tr>
      <tr><td>Inter, Inter Tight, JetBrains Mono fonts</td><td>Google Fonts, hosted on this website</td><td>SIL Open Font License 1.1</td></tr>
      <tr><td>three.js, GSAP, Lenis libraries</td><td>three.js, GreenSock, darkroom.engineering</td><td>MIT / standard GSAP licence</td></tr>
    </tbody>
  </table>
</div></article>
</main>
'''

if __name__ == '__main__':
    build_home()
    build_doc('privacy', 'privacy', PRIVACY_TITLE, PRIVACY_MAIN)
    build_doc('crediti', 'credits', CREDITS_TITLE, CREDITS_MAIN)
