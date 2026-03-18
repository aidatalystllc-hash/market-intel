import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/processExcel';
import { mapColumns } from '@/lib/claudeMapper';
import { transformCompanies } from '@/lib/dataTransformer';

// Next.js App Router: increase body size limit for large Excel files
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyFile = formData.get('companyFile') as File | null;
    const locationFile = formData.get('locationFile') as File | null;

    if (!companyFile) {
      return NextResponse.json(
        { error: 'Company data file is required.' },
        { status: 400 }
      );
    }

    // Parse company file
    const companyBuffer = Buffer.from(await companyFile.arrayBuffer());
    const companyData = parseFile(companyBuffer, companyFile.name);

    if (companyData.rows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in company file. Check that rows contain data.' },
        { status: 400 }
      );
    }

    // Map company columns
    const companyMapping = await mapColumns(companyData.columns);

    // Parse location file if provided
    let locationData = null;
    let locationMapping = null;

    if (locationFile) {
      const locationBuffer = Buffer.from(await locationFile.arrayBuffer());
      locationData = parseFile(locationBuffer, locationFile.name);

      if (locationData.rows.length > 0) {
        locationMapping = await mapColumns(locationData.columns);
      }
    }

    // Transform into normalized Company objects
    const companies = transformCompanies(
      companyData.rows,
      companyMapping,
      locationData?.rows ?? null,
      locationMapping
    );

    // Filter out companies with no useful data
    const validCompanies = companies.filter(
      (c) => c.name && c.name !== 'Company 0'
    );

    const warnings: string[] = [];

    // Check for coordinates
    const withCoords = validCompanies.filter((c) => c.lat !== null && c.lng !== null);
    if (withCoords.length === 0) {
      warnings.push(
        'No companies with location data. The map will be empty. Upload a file with latitude/longitude columns for geographic view.'
      );
    } else if (withCoords.length < validCompanies.length) {
      warnings.push(
        `${validCompanies.length - withCoords.length} companies are missing coordinates and won't appear on the map.`
      );
    }

    // For very large datasets, strip heavy fields to keep response under sessionStorage limits (~5MB)
    const stripped = validCompanies.map((c) => ({
      ...c,
      // Limit locations array to first 50 per company to save space
      locations: c.locations.slice(0, 50),
      // Trim long descriptions
      description: c.description ? c.description.slice(0, 500) : '',
    }));

    return NextResponse.json({
      companies: stripped,
      companyMapping,
      locationMapping,
      stats: {
        totalCompanies: stripped.length,
        withCoordinates: withCoords.length,
        companyColumns: companyData.columns.slice(0, 30), // Don't send 960 column names back
        locationColumns: locationData?.columns.slice(0, 30) ?? [],
      },
      warnings,
    });
  } catch (err) {
    console.error('Process error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        error: `Failed to process files: ${message.slice(0, 200)}. Try with a smaller file or check the format.`,
      },
      { status: 500 }
    );
  }
}
