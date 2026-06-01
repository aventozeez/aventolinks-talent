const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  BorderStyle, HeadingLevel, LevelFormat, ExternalHyperlink,
  TabStopType, TabStopPosition, UnderlineType
} = require('docx');
const fs = require('fs');

const DARK_BLUE = "1F3864";
const LIGHT_BLUE = "2E75B6";
const BLACK = "000000";
const GRAY = "595959";

const NAME_SIZE = 36;      // 18pt
const SECTION_SIZE = 22;   // 11pt
const BODY_SIZE = 20;      // 10pt
const SMALL_SIZE = 18;     // 9pt

// Section header with bottom border
function sectionHeader(text) {
  return new Paragraph({
    spacing: { before: 220, after: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE, space: 4 }
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: SECTION_SIZE,
        color: DARK_BLUE,
        font: "Arial",
      })
    ]
  });
}

// Role/title line with right-aligned date using tab stop
function roleRow(title, place, dateRange) {
  return new Paragraph({
    spacing: { before: 100, after: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: title, bold: true, size: BODY_SIZE, color: BLACK, font: "Arial" }),
      new TextRun({ text: "\t" + dateRange, size: SMALL_SIZE, color: GRAY, font: "Arial" }),
    ]
  });
}

function institution(text) {
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    children: [
      new TextRun({ text, italics: true, size: BODY_SIZE, color: GRAY, font: "Arial" })
    ]
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    children: [
      new TextRun({ text, size: BODY_SIZE, color: BLACK, font: "Arial", ...opts })
    ]
  });
}

function subText(text) {
  return new Paragraph({
    spacing: { before: 0, after: 30 },
    indent: { left: 0 },
    children: [
      new TextRun({ text, size: SMALL_SIZE, color: GRAY, font: "Arial", italics: true })
    ]
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    numbering: { reference: "bullets", level: 0 },
    children: [
      new TextRun({ text, size: BODY_SIZE, color: BLACK, font: "Arial" })
    ]
  });
}

function numberedItem(num, text) {
  return new Paragraph({
    spacing: { before: 0, after: 30 },
    numbering: { reference: "numbers", level: 0 },
    children: [
      new TextRun({ text, size: BODY_SIZE, color: BLACK, font: "Arial" })
    ]
  });
}

function spacer(before = 80) {
  return new Paragraph({ spacing: { before, after: 0 }, children: [new TextRun("")] });
}

// Education entry
function eduEntry(degree, school, dateRange, gpa, extra) {
  const rows = [];
  rows.push(new Paragraph({
    spacing: { before: 100, after: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: degree, bold: true, size: BODY_SIZE, color: BLACK, font: "Arial" }),
      new TextRun({ text: "\t" + dateRange, size: SMALL_SIZE, color: GRAY, font: "Arial" }),
    ]
  }));
  rows.push(new Paragraph({
    spacing: { before: 0, after: gpa || extra ? 20 : 60 },
    children: [
      new TextRun({ text: school, italics: true, size: BODY_SIZE, color: GRAY, font: "Arial" })
    ]
  }));
  if (gpa) {
    rows.push(new Paragraph({
      spacing: { before: 0, after: extra ? 20 : 60 },
      children: [new TextRun({ text: "GPA: " + gpa, size: SMALL_SIZE, color: GRAY, font: "Arial" })]
    }));
  }
  if (extra) {
    rows.push(new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: extra, size: SMALL_SIZE, color: GRAY, font: "Arial", italics: true })]
    }));
  }
  return rows;
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 200 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 240 } } }
        }]
      },
    ]
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: BODY_SIZE, color: BLACK } }
    }
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [
      // ── NAME ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({
            text: "AZEEZ ADEKUNLE ADEBAYO",
            bold: true,
            size: NAME_SIZE,
            color: DARK_BLUE,
            font: "Arial",
          })
        ]
      }),

      // ── CONTACT LINE 1 ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({ text: "Auburn, Alabama, USA  |  +1 (662) 469-7276  |  aaa0084@auburn.edu", size: BODY_SIZE, color: GRAY, font: "Arial" }),
        ]
      }),

      // ── CONTACT LINE 2 (LinkedIn) ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK_BLUE, space: 6 }
        },
        children: [
          new ExternalHyperlink({
            link: "https://linkedin.com/in/azeez-adebayo-b8bb1987",
            children: [
              new TextRun({
                text: "linkedin.com/in/azeez-adebayo-b8bb1987",
                size: BODY_SIZE,
                color: LIGHT_BLUE,
                font: "Arial",
                underline: { type: UnderlineType.SINGLE, color: LIGHT_BLUE }
              })
            ]
          })
        ]
      }),

      spacer(120),

      // ── RESEARCH INTERESTS ──
      sectionHeader("Research Interests"),
      new Paragraph({
        spacing: { before: 80, after: 60 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Fracture Mechanics  \u2022  Advanced Materials  \u2022  Cellulose Nanomaterials  \u2022  Experimental Mechanics  \u2022  High-Strain Rate Behavior",
            size: BODY_SIZE, color: BLACK, font: "Arial"
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Sustainable Materials Engineering  \u2022  Finite Element Analysis  \u2022  Computational Mechanics",
            size: BODY_SIZE, color: BLACK, font: "Arial"
          })
        ]
      }),

      // ── EDUCATION ──
      sectionHeader("Education"),
      spacer(40),

      ...eduEntry(
        "Ph.D. in Mechanical Engineering (In Progress)",
        "Auburn University",
        "Jan 2022 \u2013 Dec 2024 (Expected)",
        "4.0/4.0",
        "Research: Material Processing and Mechanical Behavior of High-Performance Cellulose Nanopaper Made from Cellulose Nanofibrils"
      ),
      ...eduEntry(
        "M.S. in Financial Engineering",
        "WorldQuant University, USA",
        "Jan 2023 \u2013 Present",
        null, null
      ),
      ...eduEntry(
        "M.S. in Mechanical Engineering",
        "Auburn University",
        "Jan 2022 \u2013 May 2023",
        "4.0/4.0", null
      ),
      ...eduEntry(
        "M.S. in Mechanical Engineering",
        "University of Ibadan",
        "Jan 2018 \u2013 Feb 2021",
        "3.9/4.0 (Distinction)",
        "Thesis: Investigation of Poincar\u00e9 Solutions of Nonlinear Duffing and Pendulum Systems under Periodic Excitation Using Fractal Disk Characterization"
      ),
      ...eduEntry(
        "B.S. in Mechanical Engineering",
        "University of Ibadan",
        "Jan 2013 \u2013 Dec 2016",
        null,
        "Thesis: Design of a Traffic Surveillance System for Monitoring Flow at the University of Ibadan Main Gate"
      ),

      // ── RESEARCH EXPERIENCE ──
      sectionHeader("Research Experience"),
      spacer(40),
      roleRow("Doctoral Researcher", "", "Jan 2022 \u2013 Dec 2024"),
      institution("Failure Mechanics and Optical Techniques Laboratory, Auburn University"),
      bullet("Conducted experimental investigations into tensile deformation and fracture behavior of cellulose nanopaper using high-speed diagnostics"),
      bullet("Captured dynamic crack propagation using ultra-high-speed imaging (up to 1,000,000 fps)"),
      bullet("Applied Digital Image Correlation (DIC) for full-field strain and displacement analysis"),
      bullet("Fabricated nanostructured materials and evaluated mechanical performance across processing conditions"),
      bullet("Quantified fracture properties including stress intensity factors, crack growth resistance, and energy release rates"),
      bullet("Integrated experimental data with Finite Element Analysis (FEA) models for predictive material behavior"),
      bullet("Contributed to the development of sustainable alternatives to conventional polymer materials"),

      // ── TEACHING EXPERIENCE ──
      sectionHeader("Teaching Experience"),
      spacer(40),
      roleRow("Graduate Teaching Assistant", "", "May 2022 \u2013 Dec 2024"),
      institution("Auburn University"),
      bullet("Delivered laboratory instruction in Mechanics of Materials (tensile, torsion, beam deflection, photoelasticity)"),
      bullet("Guided students in experimental stress analysis and structural behavior"),
      bullet("Supported student projects involving Finite Element Analysis and structural design"),
      spacer(60),
      roleRow("Graduate Teaching and Research Assistant", "", "Sept 2019 \u2013 Feb 2021"),
      institution("University of Ibadan"),
      bullet("Taught undergraduate courses in Mechanics of Materials, Material Science, and Dynamics"),
      bullet("Developed interactive teaching methods and supervised laboratory sessions"),

      // ── PUBLICATIONS ──
      sectionHeader("Publications"),
      spacer(40),
      numberedItem(1, "Adebayo, A.A., et al. (2022). Investigation of Poincar\u00e9 Solutions of Nonlinear Duffing and Pendulum Systems under Periodic Excitations Using Fractal Disk Characterization."),
      numberedItem(2, "Ayegbeso, D.O., et al. Categorization of Duffing Oscillator Behavior Using Lyapunov Exponents."),
      numberedItem(3, "John, T.J., et al. Chaos Diagram Analysis of Harmonic Systems."),
      numberedItem(4, "Musa, F.A., et al. Development and Evaluation of a Mini-Potentiostat for Corrosion Studies."),
      numberedItem(5, "Vincent, S.A., & Adebayo, A.A. (2023). Optimization of Finite Element Analysis for Minimizing Maximum Stress in Multi-layer Composites."),
      numberedItem(6, "Raphael, L.O., et al. Analysis of Nonlinear Oscillator Behavior under Variable Excitations."),

      // ── CONFERENCE PRESENTATIONS ──
      sectionHeader("Conference Presentations"),
      spacer(40),
      bullet("International Mechanical Engineering Congress & Exposition (IMECE), 2023"),
      bullet("Auburn Mechanical Engineering Conference, 2023 & 2024"),
      bullet("Auburn Three Minute Thesis (3MT), 2023 & 2024"),
      bullet("Auburn Research Symposium, 2023"),

      // ── TECHNICAL SKILLS ──
      sectionHeader("Technical Skills"),
      spacer(40),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [
          new TextRun({ text: "Experimental:  ", bold: true, size: BODY_SIZE, color: DARK_BLUE, font: "Arial" }),
          new TextRun({ text: "Digital Image Correlation (DIC), High-Speed Imaging, Mechanical Testing, Material Characterization", size: BODY_SIZE, color: BLACK, font: "Arial" }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [
          new TextRun({ text: "Computational:  ", bold: true, size: BODY_SIZE, color: DARK_BLUE, font: "Arial" }),
          new TextRun({ text: "Abaqus, MATLAB, Python, SolidWorks", size: BODY_SIZE, color: BLACK, font: "Arial" }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: "Engineering Methods:  ", bold: true, size: BODY_SIZE, color: DARK_BLUE, font: "Arial" }),
          new TextRun({ text: "Finite Element Analysis (FEA), Fracture Mechanics, Stress Analysis, Data Modeling", size: BODY_SIZE, color: BLACK, font: "Arial" }),
        ]
      }),

      // ── AWARDS & RECOGNITIONS ──
      sectionHeader("Awards and Recognitions"),
      spacer(40),
      bullet("People\u2019s Choice Award \u2013 Outstanding Oral Presentation, Auburn 3MT, 2024"),
      bullet("Interconnecting and Packaging Electronic Circuits (IPC) Scholarship, 2023, 2024"),
      bullet("Graduate Research Scholars Program (GRSP) Award, Alabama EPSCoR, 2023, 2024"),
      bullet("Walter Woltosz Fellowship, Auburn University, 2022\u20132024"),
      bullet("Best Poster Award, Mechanical Engineering Conference, Auburn, 2023, 2024"),
      bullet("Award of Excellence, African Students Association, 2023"),
      bullet("Best Graduating MSc Student in Mechanical Engineering, University of Ibadan, 2021"),

      // ── CERTIFICATIONS ──
      sectionHeader("Certifications"),
      spacer(40),
      bullet("Project Management Institute (PMI) Certification"),
      bullet("IPC Certifications: Solder Joint Standards and Component Color Codes"),
      bullet("Laboratory Safety Certifications: Cryogenic Liquid Handling, Compressed Gas Safety, General Lab Safety"),
      bullet("Financial and Business Accounting Fundamentals"),

      // ── LEADERSHIP & SERVICE ──
      sectionHeader("Leadership and Service"),
      spacer(40),
      roleRow("Vice President, Graduate Student Council", "", "2023 \u2013 2024"),
      institution("Auburn University"),
      bullet("Represented over 5,000 graduate students across multiple academic programs"),
      bullet("Led initiatives to improve research funding access and student welfare"),
      spacer(60),
      new Paragraph({
        spacing: { before: 0, after: 30 },
        children: [
          new TextRun({ text: "Graduate Student Mentor", bold: true, size: BODY_SIZE, color: BLACK, font: "Arial" }),
          new TextRun({ text: "  \u2014  Auburn University", size: BODY_SIZE, color: GRAY, font: "Arial" }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 30 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: "Model City Judge, Future City Competition, Alabama Region", bold: true, size: BODY_SIZE, color: BLACK, font: "Arial" }),
          new TextRun({ text: "\t2023", size: SMALL_SIZE, color: GRAY, font: "Arial" }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: "Engineering Outreach Volunteer (E-Day)", bold: true, size: BODY_SIZE, color: BLACK, font: "Arial" }),
          new TextRun({ text: "  \u2014  Auburn University", size: BODY_SIZE, color: GRAY, font: "Arial" }),
        ]
      }),

      // ── PROFESSIONAL AFFILIATIONS ──
      sectionHeader("Professional Affiliations"),
      spacer(40),
      bullet("American Society of Mechanical Engineers (ASME)"),
      bullet("National Society of Black Engineers (NSBE)"),
      bullet("Nigerian Institute of Mechanical Engineers (NIMechE)"),
      bullet("Rotary International"),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:/Users/azeez/Downloads/aventolinkstalent/Azeez_Adebayo_CV.docx", buffer);
  console.log("CV created successfully.");
});
